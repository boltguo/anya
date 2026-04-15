/**
 * @module config/defaults
 * @description Anya configuration type definition and default values.
 *
 * Every field has a sensible default so the agent works out of the box
 * (except API keys / auth which must be provided by the user).
 *
 * Provider structure supports multiple backends:
 * - `gemini`: Google AI Studio (API key)
 * - `openai`: OpenAI Codex (OAuth device code)
 */

/** Complete Anya configuration shape. Every field has a default. */
export interface AnyaConfig {
  /** JSON Schema reference (optional, for IDE validation). */
  $schema?: string;
  /** Config format version for migration. */
  version: string;

  /** Agent identity and personality. */
  agent: {
    /** Display name. */
    name: string;
    /** System prompt personality (fallback if SOUL.md is missing). */
    personality: string;
  };

  provider: {
    /** Active provider backend. */
    active: 'gemini' | 'openai';

    gemini: {
      model: string;
      api_key: string;
      api_keys?: string[];
    };

    openai: {
      model: string;
      // No api_key — tokens stored in auth.json
    };

    /** Shared generation parameters */
    max_tokens: number;
    temperature: number;
    max_retries: number;
  };

  /** Google Cloud Vertex AI configuration (for image generation, etc.). */
  vertex: {
    /** GCP project ID. If set, enables Vertex AI as a backend option. */
    project: string;
    /** GCP region. Use 'global' for best availability. */
    location: string;
  };

  /** Image generation settings. */
  image_gen: {
    /** Backend: 'vertex' uses Vertex AI (ADC auth), 'ai_studio' uses Gemini API Key. */
    backend: 'vertex' | 'ai_studio';
    /** Model to use for image generation. */
    model: string;
    /** Default aspect ratio (e.g., '1:1', '16:9', '9:16'). */
    aspect_ratio: string;
  };

  /** Tool configuration — which tools are enabled and their settings. */
  tools: {
    /** List of enabled tool names (order determines LLM schema order). */
    enabled: string[];
    /** Shell tool security settings. */
    shell: {
      /** Whether shell commands require user approval. */
      require_approval: boolean;
      /** Commands that skip approval (prefix match). */
      approval_allowlist: string[];
      /** Default working directory for shell commands. */
      working_directory: string;
    };
    /** Web search tool settings. */
    web_search: {
      /** Search backend (currently only 'tavily'). */
      backend: string;
      /** API key for the search backend. */
      api_key: string;
      /** Maximum number of results to return. */
      max_results: number;
    };
  };

  /** File system security boundaries. */
  security: {
    /** Directories the agent can access without approval. */
    allowed_paths: string[];
    /** Action when accessing paths outside allowed_paths. */
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

  vision: {
    /** Vision model (uses global Gemini API key). */
    model: string;
  };

  tts: {
    voice: string;
    rate: string;
  };

  cron: {
    enabled: boolean;
  };

  ui: {
    show_tool_calls: boolean;
    show_thinking: boolean;
  };

  /** Advanced tuning parameters. */
  advanced: {
    /** Maximum context window size in tokens. */
    context_window: number;
    /** Trigger compression when token usage exceeds this ratio (0-1). */
    compress_threshold: number;
    /** Maximum sessions to display in session list. */
    session_history_limit: number;
    /** Maximum messages to load from history per session. */
    max_history_messages: number;
    /** Logging verbosity: 'debug' | 'info' | 'warn' | 'error'. */
    log_level: string;
    /** Maximum ReAct loop iterations before forced stop. */
    max_react_loops: number;
  };
}

/** Built-in default configuration. Merged with user's config.json at load time. */
export const DEFAULT_CONFIG: AnyaConfig = {
  $schema: './config.schema.json',
  version: '0.2.0',

  agent: {
    name: 'anya',
    personality: 'You are Anya, a concise and direct personal AI assistant. Prioritize solving the user\'s problem without unnecessary verbosity. Use tools when needed to complete tasks.',
  },

  provider: {
    active: 'gemini',

    gemini: {
      model: 'gemini-3-flash-preview',
      api_key: '',
    },

    openai: {
      model: 'gpt-5.4',
    },

    max_tokens: 8192,
    temperature: 0.7,
    max_retries: 3,
  },

  vertex: {
    project: '',
    location: 'global',
  },

  image_gen: {
    backend: 'vertex',
    model: 'gemini-3.1-flash-image-preview',
    aspect_ratio: '1:1',
  },

  tools: {
    enabled: [
      'read_file',
      'write_file',
      'list_dir',
      'shell',
      'web_search',
      'memory_update',
      'skill_manage',
      'skill_view',
      'clarify',
      'tg',
      'tts',
      'image_gen',
    ],
    shell: {
      require_approval: true,
      approval_allowlist: [
        'git status', 'git log', 'git diff',
        'ls', 'pwd', 'cat', 'head', 'tail',
        'wc', 'find', 'which',
      ],
      working_directory: '~',
    },
    web_search: {
      backend: 'tavily',
      api_key: '',
      max_results: 5,
    },
  },

  security: {
    allowed_paths: ['~/.anya/'],
    fence_mode: 'ask',
  },

  telegram: {
    enabled: false,
    bot_token: '',
    allowed_user_ids: [],
  },

  stt: {
    groq_api_key: '',
    model: 'whisper-large-v3-turbo',
  },

  vision: {
    model: 'gemini-3-flash-preview',
  },

  tts: {
    voice: 'en-US-AriaNeural',
    rate: '+0%',
  },

  cron: {
    enabled: false,
  },

  ui: {
    show_tool_calls: true,
    show_thinking: false,
  },

  advanced: {
    context_window: 1000000,          // Gemini 2.5 supports 1M context
    compress_threshold: 0.8,          // Compress when 80% of context used
    session_history_limit: 50,        // Show last 50 sessions in `anya sessions`
    max_history_messages: 200,        // Load at most 200 messages from DB
    log_level: 'info',                // Default log verbosity
    max_react_loops: 20,              // Safety limit on ReAct iterations
  },
};
