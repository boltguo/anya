// config/defaults.ts — AnyaConfig shape and defaults

export interface AnyaConfig {
  $schema?: string;
  version: string;

  provider: {
    model: string;
    // Smaller/faster variant used by llmSubroutine for compound-tool internal
    // generations (sentence drills, coaching examples, rubric grading). Falls
    // back to `model` if unset.
    subroutine_model?: string;
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

  azure: {
    speech_key: string;
    speech_region: string;
  };

  stt: {
    groq_api_key: string;
    model: string;
  };

  tts: {
    voice: string;
    rate: string;
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

  security: {
    allowed_paths: string[];
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
    subroutine_model: 'gpt-5.4-mini',
    max_retries: 3,
    context_window: 1000000,
    compress_threshold: 0.8,
    max_history_messages: 200,
    max_react_loops: 20,
  },

  gemini: { api_key: '', vision_model: 'gemini-3-flash-preview' },
  web_search: { api_key: '', max_results: 5 },
  azure: { speech_key: '', speech_region: 'eastasia' },
  stt: { groq_api_key: '', model: 'whisper-large-v3-turbo' },
  tts: { voice: 'en-US-AriaNeural', rate: '+0%' },

  telegram: { enabled: false, bot_token: '', allowed_user_ids: [] },
  cron: {
    enabled: false,
    tick_seconds: 60,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    default_platform: 'telegram',
    default_chat_id: '',
  },

  security: { allowed_paths: ['~/.anya/'] },
  ui: { show_tool_calls: true },
  onboarding: { profile_done: false, placement_done: false },
};
