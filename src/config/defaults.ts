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

export interface AnyaConfig {
  $schema?: string;
  version: string;

  agent: {
    name: string;
    personality: string;
  };

  provider: {
    /** Active provider: 'gemini' | 'openai' */
    active: string;

    gemini: {
      model: string;
      api_key: string;
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

  cron: {
    enabled: false,
  },

  ui: {
    show_tool_calls: true,
    show_thinking: false,
  },

  advanced: {
    context_window: 1000000,
    compress_threshold: 0.8,
    session_history_limit: 50,
    max_history_messages: 50,
    log_level: 'info',
    max_react_loops: 20,
  },
};
