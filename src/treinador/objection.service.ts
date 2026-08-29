// Objeções comuns (seção 6 da Fatia 5) — lista estática, não é dado de
// tenant nem precisa de banco: o vendedor escolhe uma ou escreve livremente.
export interface ObjecaoComum {
  code: string;
  label: string;
}

export const OBJECOES_COMUNS: ObjecaoComum[] = [
  { code: 'ESTA_CARO', label: 'Está caro' },
  { code: 'VOU_PENSAR', label: 'Vou pensar' },
  { code: 'SO_OLHANDO', label: 'Só estou olhando' },
  { code: 'VOU_DAR_VOLTA', label: 'Vou dar uma volta' },
  { code: 'FALAR_COM_CONJUGE', label: 'Preciso falar com meu marido/minha esposa' },
  { code: 'MAIS_BARATO_INTERNET', label: 'Na internet está mais barato' },
  { code: 'NAO_GOSTOU', label: 'Não gostei de nenhum' },
  { code: 'SO_QUER_UM_ITEM', label: 'Só quero esse item' },
  { code: 'NAO_PRECISA_OUTRO', label: 'Não preciso de outro produto' },
  { code: 'DEPOIS_VOLTO', label: 'Depois eu volto' },
  { code: 'SEM_DINHEIRO_AGORA', label: 'Não tenho dinheiro agora' },
];

export function listarObjecoesComuns(): ObjecaoComum[] {
  return OBJECOES_COMUNS;
}
