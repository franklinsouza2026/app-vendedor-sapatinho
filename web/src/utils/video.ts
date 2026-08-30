// Constrói uma URL de embed segura a partir da URL de vídeo salva (sempre já
// validada pelo backend como YouTube/Vimeo — seção 7 da Fatia 7.5C). Nunca
// renderiza iframe/HTML arbitrário vindo do Admin, só um src construído aqui
// a partir de um domínio conhecido.
export function urlDeEmbedSegura(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname === 'youtube.com' || parsed.hostname === 'www.youtube.com') {
      const id = parsed.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname === 'vimeo.com') {
      const id = parsed.pathname.slice(1);
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (parsed.hostname === 'player.vimeo.com') {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}
