// Abstração de pesquisa externa (seção 9/10). O LLM NUNCA navega a internet
// por conta própria — só interpreta resultados já obtidos por uma
// ferramenta controlada. RETRIEVAL (este arquivo) é sempre separado de
// LLM INTERPRETATION (research.service.ts).
//
// Sem serviço/API de busca real contratado nesta fatia (nenhum custo
// externo, nenhum scraping do Google, nenhuma automação de browser pra
// contornar mecanismo de busca) — `MockResearchSourceProvider` devolve
// fontes fixas e determinísticas, parametrizadas só pelo tópico. Isso NÃO
// bloqueia a arquitetura (seção 104: "ausência de API de busca real não
// bloqueia a fatia") — a interface abaixo é o contrato que um provider real
// (ex.: uma API de busca paga) implementaria no futuro, sem exigir nenhuma
// mudança no Research Agent que a consome.
//
// Se um dia um provider REAL de busca com fetch de conteúdo externo for
// implementado, ele precisa aplicar (seção 12/71, não implementado aqui por
// não haver fetch real ainda): allowlist de protocolo (só http/https),
// bloqueio de localhost/127.0.0.0/8/::1/ranges privados/link-local/
// endpoints de metadata de cloud, resolução de DNS validada antes de
// conectar (proteção contra DNS rebinding), limite de tamanho de resposta,
// timeout, checagem de content-type, e revalidação do destino de cada
// redirect — nunca URL arbitrária do resultado de busca sendo buscada sem
// essas checagens.
export interface FonteEncontrada {
  url: string;
  title: string;
  publisher: string | null;
  author: string | null;
  publishedAt: Date | null;
  summary: string;
  reliability: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';
  rightsNotes: string | null;
}

export interface ResearchSourceProvider {
  search(topic: string): Promise<FonteEncontrada[]>;
}

// Fontes reconhecidas como mais confiáveis (seção 16) — só pra calibrar o
// mock; um provider real de busca teria seu próprio critério de
// reliability, mas a transparência do critério continua exigida.
const PUBLISHERS_ALTA_CONFIABILIDADE = ['SEBRAE', 'Harvard Business Review', 'Associação Brasileira de Varejo'];

export class MockResearchSourceProvider implements ResearchSourceProvider {
  async search(topic: string): Promise<FonteEncontrada[]> {
    const slug = topic.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 60) || 'tema-generico';

    return [
      {
        url: `https://mock-source.internal/artigos/${slug}-guia-pratico`,
        title: `Guia prático: ${topic}`,
        publisher: PUBLISHERS_ALTA_CONFIABILIDADE[0],
        author: null,
        publishedAt: new Date('2026-01-15'),
        summary: `Resumo (mock): boas práticas gerais de varejo relacionadas a "${topic}", incluindo passos práticos e exemplos de abordagem.`,
        reliability: 'HIGH',
        rightsNotes: 'Uso permitido para síntese/resumo com atribuição — nunca cópia extensa (mock).',
      },
      {
        url: `https://mock-source.internal/blog/${slug}-dicas`,
        title: `Dicas sobre ${topic} para equipes de vendas`,
        publisher: 'Blog de Varejo (mock)',
        author: 'Autor não identificado',
        publishedAt: new Date('2026-05-02'),
        summary: `Resumo (mock): conteúdo de blog genérico sobre ${topic}, tom mais informal, sem citar fonte primária.`,
        reliability: 'MEDIUM',
        rightsNotes: null,
      },
    ];
  }
}
