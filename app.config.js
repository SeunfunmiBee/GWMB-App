// APP_TARGET=admin builds the web admin (appadmin.girlswhomeanbusiness.org) from src/admin-app.
// Every other build is the mobile app from src/app, so admin screens never ship in the native bundle.
module.exports = ({ config }) =>
  process.env.APP_TARGET === 'admin'
    ? { ...config, name: 'GWMB Admin', extra: { ...config.extra, router: { ...config.extra?.router, root: 'src/admin-app' } } }
    : config;
