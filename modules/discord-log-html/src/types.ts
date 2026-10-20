/**
 * A channel log in the shape Discord returns from GET /channels/:id/messages,
 * plus the guild names that payload leaves out (roles, and member colours).
 * Another project can fill this from discord.js or from the REST API.
 */
export type ChatLog = {
  channel?: { id?: string; name?: string | null };
  roles?: ChatRole[];
  members?: ChatMember[];
  channels?: Array<{ id: string; name: string }>;
  messages?: RawMessage[];
};

export type ChatRole = {
  id: string;
  name: string;
  color?: number;
  position?: number;
};

export type ChatMember = {
  id: string;
  display?: string;
  roles?: string[];
};

export type RawUser = {
  id: string;
  username?: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
  bot?: boolean;
};

export type RawAttachment = {
  id?: string;
  filename?: string;
  name?: string;
  size?: number;
  url?: string;
  proxy_url?: string;
  content_type?: string | null;
  width?: number | null;
  height?: number | null;
  spoiler?: boolean;
};

export type RawEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  type?: string;
  author?: { name?: string; url?: string; icon_url?: string };
  thumbnail?: { url?: string; proxy_url?: string; width?: number | null; height?: number | null };
  image?: { url?: string; proxy_url?: string; width?: number | null; height?: number | null };
  video?: { url?: string; proxy_url?: string };
  footer?: { text?: string; icon_url?: string };
  fields?: Array<{ name?: string; value?: string; inline?: boolean }>;
};

export type RawEmoji = {
  id?: string | null;
  name?: string | null;
  animated?: boolean;
};

export type RawComponent = {
  type?: number;
  components?: RawComponent[];
  style?: number;
  label?: string;
  placeholder?: string;
  url?: string;
  emoji?: RawEmoji | null;
};

export type RawMessage = {
  id: string;
  type?: number;
  content?: string;
  timestamp?: string;
  edited_timestamp?: string | null;
  flags?: number;
  author?: RawUser;
  member?: { nick?: string | null; roles?: string[] };
  mentions?: RawUser[];
  mention_roles?: string[];
  attachments?: RawAttachment[];
  embeds?: RawEmbed[];
  reactions?: Array<{ count?: number; emoji?: RawEmoji }>;
  message_reference?: { message_id?: string };
  referenced_message?: RawMessage | null;
  sticker_items?: Array<{ id: string; name?: string; format_type?: number; url?: string }>;
  components?: RawComponent[];
};
