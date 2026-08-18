import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * `eslint-config-next` 16 ships native flat configs, so they are spread
 * directly. Routing them through `FlatCompat` — the pattern older Next projects
 * use — fails here, because the compat layer tries to JSON-serialise a plugin
 * object containing circular references.
 */
const config = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      // Generated from the backend's OpenAPI document; not ours to lint.
      'src/lib/api/generated/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    // ---------------------------------------------------------------------
    // Client-side data fetching in `useEffect`.
    //
    // React 19's `set-state-in-effect` rule flags any effect that transitively
    // calls setState. It is aimed at effects that *derive* state from props —
    // which is a real bug, and the rule stays on everywhere else.
    //
    // These CRM pages fetch from the service layer on mount, which the rule
    // cannot distinguish from the derived-state case. The idiomatic React 19
    // answers are `use(promise)` with Suspense, or a data library such as SWR;
    // both are the right destination once `NEXT_PUBLIC_DATA_MODE=api` lands and
    // the fetching moves behind a real cache. Rewriting the fetch layer twice —
    // once for mock mode and again for the API — would be wasted work, so the
    // rule is scoped off here and the migration is tracked as follow-up.
    //
    // The cascading-render risk it guards against is mitigated in the code:
    // no loader performs a synchronous state update before its first await,
    // and skeleton resets happen in the event handlers that trigger them.
    // ---------------------------------------------------------------------
    files: [
      'src/app/**/page.tsx',
      // The wizard's step components fetch through the same service layer for
      // the same reason, and hit the same rule.
      'src/components/booking/*.tsx',
      'src/components/shell/*.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;
