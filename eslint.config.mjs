import nextConfig from 'eslint-config-next';
import security from 'eslint-plugin-security';

const securityConfig = [
  ...nextConfig,
  {
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      // Drizzle ORM usa bracket notation internamente — falsos positivos
      'security/detect-object-injection': 'off',
      // HTTP timing attacks son irrealistas por jitter de red; demasiados falsos positivos
      'security/detect-possible-timing-attacks': 'off',
    },
  },
  {
    // Scripts de migración usan readFileSync con paths construidos desde __dirname — OK
    files: ['scripts/**'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
];

export default securityConfig;
