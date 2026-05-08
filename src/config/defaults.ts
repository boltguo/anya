/**
 * @module config/defaults
 * @description Anya configuration type definition and default values.
 *
 * Agent identity is defined in SOUL.md, not here.
 * LLM: Codex reverse-proxy (chatgpt.com/backend-api/codex).
 * Azure: Speech key for TTS + pronunciation assessment.
 */

export interface AnyaConfig {
  $schema?: string;
  version: string;

  /** LLM provider settings. */
  provider: {
    model: string;
    max_tokens: number;
    temperature: number;
    max_retries: number;
  };

  /** Gemini AI Studio — API key for LLM + multimodality. */
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
    tick_seconds: number;
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

  /** Azure Speech — TTS + pronunciation assessment. */
  azure: {
    speech_key: string;
    speech_region: string;
  };



  ui: {
    show_tool_calls: boolean;
  };

  advanced: {
    context_window: number;
    compress_threshold: number;
    max_history_messages: number;
    log_level: string;
    max_react_loops: number;
  };
}

export const DEFAULT_CONFIG: AnyaConfig = {
  $schema: './config.schema.json',
  version: '0.4.0',

  provider: {
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
      'tg_msg', 'tts', 'pron_assess', 'db', 'persist', 'cron'
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

  advanced: {
    context_window: 1000000,
    compress_threshold: 0.8,
    max_history_messages: 200,
    log_level: 'info',
    max_react_loops: 20,
  },
};
