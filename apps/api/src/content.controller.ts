import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, NotFoundException, Param, Patch, Post, Delete } from '@nestjs/common';
import { pool, verifiedUserId } from './auth-db';
import { InvalidBotConfig, validUuid } from './bot-config';
import { field, parseContent, parseMenu } from './content-config';
import {activeBotToken} from './user-bot-credential';
import {registerUserBotWebhook,userBotWebhookSecret} from './user-bot-telegram';
import {botConnectTestOwners} from './bot-connect-config';
import {enforceBotConnectRateLimit} from './connect-rate-limit';

@Controller('bots/:botId/builder')
export class ContentController {
  @Post('enable-menus')
  async enableMenus(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string) {
    const owner=await this.owner(auth,botId);
    if(!botConnectTestOwners(process.env).has(owner.toLowerCase()))throw new ForbiddenException('Delivery is limited to approved test accounts');
    await enforceBotConnectRateLimit(owner);
    if(process.env.USER_BOT_DELIVERY_ENABLED!=='true')throw new BadRequestException('Delivery is disabled');
    // Credential lookup also requires the bot to remain active.
    const token=await activeBotToken(botId);
    await registerUserBotWebhook(token,botId,userBotWebhookSecret(botId,process.env.USER_BOT_WEBHOOK_SECRET_KEY),fetch,false);
    return {enabled:true};
  }
  private async owner(auth: string | undefined, botId: string) {
    const owner = await verifiedUserId(auth);
    if (!validUuid(botId)) throw new BadRequestException('Invalid bot ID');
    if (!(await pool().query('select id from public.base_bots where id=$1 and owner_id=$2',[botId,owner])).rowCount) throw new NotFoundException();
    return owner;
  }
  private id(id: string) { if (!validUuid(id)) throw new BadRequestException('Invalid item ID'); return id; }
  private parse<T>(fn:()=>T): T { try {return fn();} catch(e) {if(e instanceof InvalidBotConfig) throw new BadRequestException(e.message); throw e;} }
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@Headers('authorization') auth: string | undefined, @Param('botId') botId: string) {
    await this.owner(auth,botId);
    const [content,menus]=await Promise.all([
      pool().query('select id,title,kind,body,storage_path,archived from public.base_content_items where bot_id=$1 order by created_at desc limit 200',[botId]),
      pool().query('select id,parent_id,title,response_text,content_id,url,position from public.base_menu_items where bot_id=$1 order by position,id limit 100',[botId])
    ]);
    return {content:content.rows,menus:menus.rows,mediaEnabled:!!process.env.BASE_STORAGE_SECRET_KEY};
  }
  @Post('content')
  async create(@Headers('authorization') auth: string | undefined,@Param('botId') botId:string,@Body() body:unknown) {
    const owner=await this.owner(auth,botId);
    const data=this.parse(()=>parseContent(body,owner,botId));
    const db=await pool().connect();
    try {
      await db.query('begin');
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,8))',[botId]);
      if (Number((await db.query('select count(*) from public.base_content_items where bot_id=$1',[botId])).rows[0].count)>=200) throw new BadRequestException('Content limit reached');
      if(data.storagePath) {
        if(!process.env.BASE_STORAGE_SECRET_KEY) throw new BadRequestException('Media delivery is not configured yet');
        const object=(await db.query<{metadata:{size?:number;mimetype?:string}}>('select metadata from storage.objects where bucket_id=$1 and name=$2',['base-content',data.storagePath])).rows[0];
        if(!object || Number(object.metadata?.size)!==data.bytes || object.metadata?.mimetype!==data.mime) throw new BadRequestException('Uploaded file does not match content');
      }
      const result=await db.query(`insert into public.base_content_items(bot_id,owner_id,title,kind,body,storage_path,mime,bytes) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,[botId,owner,data.title,data.kind,data.body,data.storagePath,data.mime,data.bytes]);
      await db.query('commit'); return result.rows[0];
    } catch(e) {await db.query('rollback');throw e;} finally {db.release();}
  }
  @Patch('content/:id')
  async edit(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('id') id:string,@Body() body:unknown) {
    await this.owner(auth,botId);this.id(id);
    const item=(await pool().query('select kind from public.base_content_items where id=$1 and bot_id=$2',[id,botId])).rows[0];
    if(!item)throw new NotFoundException();
    const title=this.parse(()=>field(body,'title',100));
    const text=this.parse(()=>field(body,'body',item.kind==='text'?4000:1024,item.kind!=='text'));
    await pool().query('update public.base_content_items set title=$3,body=$4 where id=$1 and bot_id=$2',[id,botId,title,text]);return {saved:true};
  }
  @Post('content/:id/archive')
  async archive(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('id') id:string) {
    await this.owner(auth,botId);this.id(id);
    // References keep an item in use until the owner explicitly unlinks it.
    const db=await pool().connect();
    try {
      await db.query('begin');
      if(!(await db.query('select id from public.base_content_items where id=$1 and bot_id=$2 for update',[id,botId])).rowCount)throw new NotFoundException();
      const linked=await db.query('select 1 from public.base_commands where content_id=$1 union all select 1 from public.base_menu_items where content_id=$1 limit 1',[id]);
      if(linked.rowCount)throw new ConflictException('Unlink this content from commands and menus before archiving');
      await db.query('update public.base_content_items set archived=true where id=$1 and bot_id=$2',[id,botId]);await db.query('commit');return {archived:true};
    }catch(e){await db.query('rollback');throw e;}finally{db.release();}
  }
  @Post('content/:id/restore')
  async restore(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('id') id:string) {
    await this.owner(auth,botId);this.id(id);
    const r=await pool().query('update public.base_content_items set archived=false where id=$1 and bot_id=$2 returning id',[id,botId]);
    if(!r.rowCount)throw new NotFoundException();return {restored:true};
  }
  @Post('content/:id/command')
  async command(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('id') id:string,@Body() body:unknown) {
    await this.owner(auth,botId);this.id(id);
    const command=this.parse(()=>field(body,'command',33)).replace(/^\//,'').toLowerCase();
    if(!/^[a-z0-9_]{1,32}$/.test(command))throw new BadRequestException('Invalid command');
    try {
      const r=await pool().query(`insert into public.base_commands(bot_id,command,response_text,content_id) select bot_id,$3,'',id from public.base_content_items where id=$1 and bot_id=$2 and not archived returning id`,[id,botId,command]);
      if(!r.rowCount)throw new NotFoundException();return r.rows[0];
    } catch(e) {if((e as {code?:string}).code==='23505')throw new ConflictException('Command already exists. Remove or edit it first.');throw e;}
  }
  @Post('menus')
  async menu(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Body() body:unknown) {
    await this.owner(auth,botId); const d=this.parse(()=>parseMenu(body));
    return this.saveMenu(botId,null,d);
  }
  @Patch('menus/:id')
  async updateMenu(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('id') id:string,@Body() body:unknown) {
    await this.owner(auth,botId);this.id(id);return this.saveMenu(botId,id,this.parse(()=>parseMenu(body)));
  }
  private async saveMenu(botId:string,id:string|null,d:ReturnType<typeof parseMenu>) {
    if(d.contentId && !(await pool().query('select id from public.base_content_items where id=$1 and bot_id=$2 and not archived',[d.contentId,botId])).rowCount)throw new BadRequestException('Content unavailable');
    try {
      const r=id?await pool().query(`update public.base_menu_items set title=$3,response_text=$4,parent_id=$5,content_id=$6,url=$7,position=$8 where bot_id=$1 and id=$2 returning id`,[botId,id,d.title,d.responseText,d.parentId,d.contentId,d.url,d.position]):
        await pool().query(`insert into public.base_menu_items(bot_id,title,response_text,parent_id,content_id,url,position) values($1,$2,$3,$4,$5,$6,$7) returning id`,[botId,d.title,d.responseText,d.parentId,d.contentId,d.url,d.position]);
      if(!r.rowCount)throw new NotFoundException();return r.rows[0];
    }catch(e){if(['23503','23514'].includes((e as {code?:string}).code??''))throw new BadRequestException('Choose a valid parent without a cycle; maximum 100 menu items');throw e;}
  }
  @Delete('menus/:id')
  async remove(@Headers('authorization') auth:string|undefined,@Param('botId') botId:string,@Param('id') id:string) {
    await this.owner(auth,botId);this.id(id);
    const r=await pool().query('delete from public.base_menu_items where bot_id=$1 and id=$2 returning id',[botId,id]);
    if(!r.rowCount)throw new NotFoundException();return {deleted:true};
  }
}
