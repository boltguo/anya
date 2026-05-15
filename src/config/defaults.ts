// config/defaults.ts — AnyaConfig shape and defaults

export interface AnyaConfig {
  $schema?: string;
  version: string;

  provider: {
    backend: 'codex';
    model: string;
    max_tokens: number;
    temperature: number;  // 0.0–1.0
    max_retries: number;
  };

  gemini: {
    api_key: string;
    vision_model: string;
  };

  tools: {
    enabled: string[];
    web_search: {
      backend: string;
      api_key: string;
      max_results: number;
    };
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
    default_platform: string;
    default_chat_id: string;
  };

  stt: {
    groq_api_key: string;
    model: string;
  };

  tts: {
    voice: string;
    rate: string;
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

  advanced: {
    context_window: number;
    compress_threshold: number;  // 0.0–1.0
    max_history_messages: number;
    log_level: string;
    max_react_loops: number;
  };
}

export const DEFAULT_CONFIG: AnyaConfig = {
  $schema: './config.schema.json',
  version: '0.4.0',

  provider: {
    backend: 'codex',
    model: 'gpt-5.4',
    max_tokens: 8192,
    temperature: 0.7,
    max_retries: 3,
  },

  gemini: {
    api_key: '',
    vision_model: 'gemini-3-flash-preview',
  },

  tools: {
    enabled: [
      'read_file', 'write_file', 'list_dir', 'web_search',
      'memory', 'skill_view', 'clarify',
      'tg_msg', 'tts', 'pron_assess', 'persist', 'cron'
    ],
    web_search: { backend: 'tavily', api_key: '', max_results: 5 },
  },

  security: { allowed_paths: ['~/.anya/'], fence_mode: 'deny' },
  telegram: { enabled: false, bot_token: '', allowed_user_ids: [] },
  cron: {
    enabled: false,
    tick_seconds: 60,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    default_platform: 'telegram',
    default_chat_id: '',
  },
  stt: { groq_api_key: '', model: 'whisper-large-v3-turbo' },
  tts: { voice: 'en-US-AriaNeural', rate: '+0%' },
  azure: { speech_key: '', speech_region: 'eastasia' },
  ui: { show_tool_calls: true },
  onboarding: { profile_done: false, placement_done: false },

  advanced: {
    context_window: 1000000,
    compress_threshold: 0.8,
    max_history_messages: 200,
    log_level: 'info',
    max_react_loops: 20,
  },
};
