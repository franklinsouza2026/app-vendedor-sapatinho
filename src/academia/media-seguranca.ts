// Segurança de mídia do CMS de treinamento (Fatia 7.5C, seção 7/51/52) —
// nunca aceitar embed/iframe bruto do Admin, nunca um protocolo perigoso.
// Sem storage de upload maduro nesta fatia (seção 8): MATERIAL é sempre um
// link externo validado, nunca um arquivo hospedado por este app.
const DOMINIOS_VIDEO_PERMITIDOS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'player.vimeo.com', 'vimeo.com'];

const PROTOCOLOS_PERIGOSOS = ['javascript:', 'data:', 'file:', 'vbscript:'];

function protocoloSeguro(url: string): boolean {
  const normalizado = url.trim().toLowerCase();
  return !PROTOCOLOS_PERIGOSOS.some((p) => normalizado.startsWith(p));
}

/** Só http(s) de um domínio de vídeo allowlisted — nunca embed/iframe bruto. */
export function urlDeVideoPermitida(url: string): boolean {
  if (!protocoloSeguro(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return DOMINIOS_VIDEO_PERMITIDOS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** Link de material (seção 8) — qualquer http(s) válido, protocolo perigoso bloqueado. */
export function urlDeMaterialPermitida(url: string): boolean {
  if (!protocoloSeguro(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
