/**
 * @module config/defaults
 * @description Anya configuration type definition and default values.
 *
 * LLM: OpenAI Codex (gpt-5.4, OAuth device code).
 * Gemini: AI Studio API key for vision + image generation.
 * Azure: Speech key for TTS + pronunciation assessment.
 */

export interface AnyaConfig {
  $schema?: string;
  version: string;

  agent: {
    name: string;
    /** Injected directly into the system prompt as the agent identity/style layer. */
    personality: string;
  };

  /**
   * Global single-user context.
   * Useful as a fallback before a domain profile is initialized.
   */
  user: {
    native_language: string;
  };

  /** LLM provider (OpenAI Codex). */
  provider: {
    model: string;
    max_tokens: number;
    temperature: number;
    max_retries: number;
  };

  /** Gemini AI Studio — vision + image generation. */
  gemini: {
    api_key: string;
    vision_model: string;
    image_model: string;
    aspect_ratio: string;
  };

  tools: {
    enabled: string[];
    shell: {
      require_approval: boolean;
      approval_allowlist: string[];
      working_directory: string;
    };
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

  cron: {
    enabled: boolean;
  };

  ui: {
    show_tool_calls: boolean;
    show_thinking: boolean;
  };

  advanced: {
    context_window: number;
    compress_threshold: number;
    session_history_limit: number;
    max_history_messages: number;
    log_level: string;
    max_react_loops: number;
  };
}

export const DEFAULT_CONFIG: AnyaConfig = {
  $schema: './config.schema.json',
  version: '0.4.0',

  agent: {
    name: 'anya',
    personality: 'You are Anya, a concise and direct personal AI assistant.',
  },

  user: {
    native_language: '',
  },

  provider: {
    model: 'gpt-5.4',
    max_tokens: 8192,
    temperature: 0.7,
    max_retries: 3,
  },

  gemini: {
    api_key: '',
    vision_model: 'gemini-3-flash-preview',
    image_model: 'gemini-3.1-flash-image-preview',
    aspect_ratio: '1:1',
  },

  tools: {
    enabled: [
      'read_file', 'write_file', 'list_dir', 'shell', 'web_search',
      'memory', 'skill_view', 'clarify',
      'tg', 'tts', 'image_gen', 'pron_assess', 'db',
    ],
    shell: {
      require_approval: true,
      approval_allowlist: ['git status', 'git log', 'git diff', 'ls', 'pwd', 'cat', 'head', 'tail', 'wc', 'find', 'which'],
      working_directory: '~',
    },
    web_search: { backend: 'tavily', api_key: '', max_results: 5 },
  },

  security: { allowed_paths: ['~/.anya/'], fence_mode: 'ask' },
  telegram: { enabled: false, bot_token: '', allowed_user_ids: [] },
  stt: { groq_api_key: '', model: 'whisper-large-v3-turbo' },
  tts: { voice: 'en-US-AriaNeural', rate: '+0%' },
  azure: { speech_key: '', speech_region: 'eastasia' },
  cron: { enabled: false },
  ui: { show_tool_calls: true, show_thinking: false },

  advanced: {
    context_window: 1000000,
    compress_threshold: 0.8,
    session_history_limit: 50,
    max_history_messages: 200,
    log_level: 'info',
    max_react_loops: 20,
  },
};
