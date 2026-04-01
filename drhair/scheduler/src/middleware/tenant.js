/**
 * Middleware que resolve o :tenant do path e injeta req.tenant
 */
function tenantMiddleware(tenantsConfig) {
  return (req, res, next) => {
    const tenantId = req.params.tenant;

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant não informado' });
    }

    const config = tenantsConfig.tenants[tenantId];

    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Tenant "${tenantId}" não encontrado`,
        available: Object.keys(tenantsConfig.tenants)
      });
    }

    if (!config.ativo) {
      return res.status(403).json({ success: false, error: `Tenant "${tenantId}" está inativo` });
    }

    req.tenantId = tenantId;
    req.tenantConfig = config;
    next();
  };
}

module.exports = tenantMiddleware;
