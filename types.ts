export interface Profile {
  id: string;
  name: string;
  avatar_url: string;
  online?: boolean;
  push_token?: string | null;
}

export interface Reaction {
  id: number;
  emoji: string;
  user_id: string;
  message_id: number;
}

export interface Message {
  id: number | string;
  content: string;
  user_id: string;
  created_at: string;
  conversation_id: number;
  media_url?: string | null;
  media_type?: string | null;
  media_duration?: number | null; // For voice notes
  reactions?: Reaction[];
  read_at?: string | null;
  forwarded_from_name?: string | null; // For forwarded messages
  is_view_once?: boolean;
  reply_to_message_id?: number | null; // For replied messages
  starred?: boolean;
  status?: 'pending' | 'failed';
}

export interface Conversation {
    id: number;
    is_group: boolean;
    display_name: string;
    display_avatar: string | null;
    last_message_content: string | null;
    last_message_created_at: string | null;
    participants: Profile[];
    online?: boolean;
}

export type SignalingPayload = {
  type: 'offer' | 'answer' | 'ice-candidate' | 'decline-call' | 'end-call' | 'audio-toggled' | 'video-toggled';
  from: string;
  data: any;
};