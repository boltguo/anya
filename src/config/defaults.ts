// config/defaults.ts — AnyaConfig shape and defaults

export interface AnyaConfig {
  $schema?: string;
  version: string;

  provider: {
    model: string;
    max_retries: number;
    context_window: number;
    compress_threshold: number;  // 0.0–1.0
    max_history_messages: number;
    max_react_loops: number;
  };

  gemini: {
    api_key: string;
    vision_model: string;
  };

  web_search: {
    api_key: string;
    max_results: number;
  };

  security: {
    allowed_paths: string[];
    fence_mode: 'ask' | 'deny' | 'allow';
  };

  telegram: {
    enabled: boolean;
    bot_token: string;
    allowed_user_ids: number[];
  };

  cron: {
    enabled: boolean;
    tick_seconds: number;  // in seconds
    timezone: string;
    default_chat_id: string;
  };

  stt: {
    groq_api_key: string;
    model: string;
  };

  tts: {
    voice: string;
  };

  azure: {
    speech_key: string;
    speech_region: string;
  };

  ui: {
    show_tool_calls: boolean;
  };

  onboarding: {
    profile_done: boolean;
    placement_done: boolean;
  };
}

export const DEFAULT_CONFIG: AnyaConfig = {
  $schema: './config.schema.json',
  version: '0.4.0',

  provider: {
    model: 'gpt-5.4',
    max_retries: 3,
    context_window: 1000000,
    compress_threshold: 0.8,
    max_history_messages: 200,
    max_react_loops: 20,
  },

  gemini: { api_key: '', vision_model: 'gemini-3-flash-preview' },

  web_search: { api_key: '', max_results: 5 },

  security: { allowed_paths: ['~/.anya/'], fence_mode: 'deny' },
  telegram: { enabled: false, bot_token: '', allowed_user_ids: [] },
  cron: {
    enabled: false,
    tick_seconds: 60,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    default_chat_id: '',
  },
  stt: { groq_api_key: '', model: 'whisper-large-v3-turbo' },
  tts: { voice: 'en-US-AriaNeural' },
  azure: { speech_key: '', speech_region: 'eastasia' },
  ui: { show_tool_calls: true },
  onboarding: { profile_done: false, placement_done: false },
};
