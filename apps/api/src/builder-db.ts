import {pool} from './auth-db';
import {type Content,type Menu} from './content-config';
export async function loadBuilder(botId:string) {
 const [contents,menus]=await Promise.all([
  pool().query<Content>('select id,title,kind,body,storage_path,archived from public.base_content_items where bot_id=$1 and not archived limit 200',[botId]),
  pool().query<Menu>('select id,parent_id,title,response_text,content_id,url,position from public.base_menu_items where bot_id=$1 order by position,id limit 100',[botId])
 ]);
 return {contents:contents.rows,menus:menus.rows};
}
