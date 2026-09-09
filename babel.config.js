module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Lets Drizzle migrations be imported as strings (`import m from './0000_init.sql'`).
      ['inline-import', { extensions: ['.sql'] }],
    ],
  };
};
