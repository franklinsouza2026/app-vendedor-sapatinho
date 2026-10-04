// Erro de negócio com status HTTP — tratado pelo errorHandler global. Nunca
// carrega detalhe interno (stack, SQL, segredo): `message` é o texto exposto.
export class ErroHttp extends Error {
  constructor(
    public status: number,
    public type: string,
    message: string
  ) {
    super(message);
  }
}

export const naoEncontrado = (o: string) => new ErroHttp(404, 'not_found', `${o} não encontrado(a)`);
export const invalido = (msg: string) => new ErroHttp(400, 'invalid', msg);
export const conflito = (msg: string) => new ErroHttp(409, 'conflict', msg);
export const proibido = (msg = 'sem permissão para este recurso') => new ErroHttp(403, 'forbidden', msg);
