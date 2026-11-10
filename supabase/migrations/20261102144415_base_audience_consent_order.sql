-- Telegram update IDs can restart randomly after a week without updates.
-- Order consent by message timestamp first, then update ID within the same second.
alter table base_private.bot_audience add column consent_message_at bigint not null default -1 check(consent_message_at>=-1);
