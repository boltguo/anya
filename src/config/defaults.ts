/**
 * Vela configuration type definition and default values.
 * Every field has a sensible default so the agent works out of the box
 * (except API keys which must be provided by the user).
 */

export interface VelaConfig {
  $schema?: string;
  version: string;

  agent: {
    name: string;
    personality: string;
  };

  provider: {
    primary: string;
    api_key: string;
    base_url: string;
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
    log_level: string;
    max_react_loops: number;
  };
}

export const DEFAULT_CONFIG: VelaConfig = {
  $schema: './config.schema.json',
  version: '0.1.0',

  agent: {
    name: 'vela',
    personality: 'You are Vela, a concise and direct personal AI assistant. Prioritize solving the user\'s problem without unnecessary verbosity. Use tools when needed to complete tasks.',
  },

  provider: {
    primary: 'gemini-2.5-flash',
    api_key: '',
    base_url: 'https://generativelanguage.googleapis.com',
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
    allowed_paths: ['~/.vela/'],
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
    log_level: 'info',
    max_react_loops: 20,
  },
};
