DROP TRIGGER IF EXISTS messaging_messages_moderation_cascade ON messaging_messages;
DROP FUNCTION IF EXISTS messaging_cascade_message();
DROP TABLE IF EXISTS "messaging_messages";
DROP TABLE IF EXISTS "messaging_conversation_states";
DROP TABLE IF EXISTS "messaging_conversations";
DROP TABLE IF EXISTS "messaging_blocks";
DROP TABLE IF EXISTS "messaging_preferences";
