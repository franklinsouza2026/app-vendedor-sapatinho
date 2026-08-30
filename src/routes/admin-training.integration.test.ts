// Admin — Central de Treinamento (Fatia 7.5C): RBAC, lifecycle editorial,
// DTO/draft leak protection, sanitização de URL de vídeo/material.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { assinarToken } from '../middlewares/auth';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';

async function tokenAdminDe(empresaId: string, lojaId: string) {
  const admin = await prisma.vendedor.create({
    data: { empresaId, lojaId, matriculaErp: `ADM-TRAIN-${Math.random()}`, nome: 'Admin Treinamento', senhaHash: 'x', papel: 'ADMIN' },
  });
  return assinarToken({ vendedorId: admin.id, empresaId, lojaId, papel: 'ADMIN' });
}

describe('RBAC em /admin/training/*', () => {
  it('VENDEDOR e GERENTE não acessam nenhuma rota de administração de treinamento', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });
    const tokenGerente = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });

    for (const token of [tokenVendedor, tokenGerente]) {
      expect((await request(app).get('/admin/training/overview').set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(app).post('/admin/training/tracks').set('Authorization', `Bearer ${token}`).send({})).status).toBe(403);
      expect((await request(app).get('/admin/training/mandamentos').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    }
  });
});

describe('Lifecycle editorial de trilha/aula (seção 10/79)', () => {
  it('DRAFT nunca aparece pro vendedor — nem por ID direto', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-draft-${Math.random()}`, title: 'Trilha em rascunho', description: 'desc' });
    expect(trilha.status).toBe(201);
    expect(trilha.body.status).toBe('DRAFT');

    const listaVendedor = await request(app).get('/academia/trilhas').set('Authorization', `Bearer ${tokenVendedor}`);
    expect(listaVendedor.body.trilhas.some((t: { id: string }) => t.id === trilha.body.id)).toBe(false);

    const detalheDireto = await request(app).get(`/academia/trilhas/${trilha.body.id}`).set('Authorization', `Bearer ${tokenVendedor}`);
    expect(detalheDireto.status).toBe(404); // genérico, nunca 403 (anti-IDOR)
  });

  it('quiz de aula DRAFT nunca é acessível nem respondível pelo vendedor, mesmo sabendo o id direto', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-quiz-draft-${Math.random()}`, title: 'X', description: 'desc' });
    const aula = await request(app)
      .post('/admin/training/lessons')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ trackId: trilha.body.id, code: `aula-quiz-draft-${Math.random()}`, title: 'Aula em rascunho', description: 'desc', content: 'conteudo', estimatedMinutes: 5 });
    const quiz = await request(app).put(`/admin/training/lessons/${aula.body.id}/quiz`).set('Authorization', `Bearer ${tokenAdmin}`).send({ passingScore: 70 });
    const questao = await request(app)
      .post('/admin/training/questions')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ quizId: quiz.body.id, question: 'Pergunta?', opcoes: [{ text: 'Certa', correct: true }, { text: 'Errada', correct: false }] });

    // Aula continua DRAFT (nenhuma transição aplicada) — GET do quiz e POST de
    // resposta precisam ser 404 genérico, nunca 200/403 (não confirma que existe).
    const getQuiz = await request(app).get(`/academia/aulas/${aula.body.id}/quiz`).set('Authorization', `Bearer ${tokenVendedor}`);
    expect(getQuiz.status).toBe(404);

    const opcaoCorreta = questao.body.opcoes.find((o: { correct: boolean }) => o.correct).id;
    const responder = await request(app)
      .post(`/academia/aulas/${aula.body.id}/quiz/responder`)
      .set('Authorization', `Bearer ${tokenVendedor}`)
      .send({ respostas: [{ questionId: questao.body.id, optionId: opcaoCorreta }] });
    expect(responder.status).toBe(404);
  });

  it('quiz de aula ARQUIVADA depois de publicada volta a ser inacessível pro vendedor', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-quiz-arq-${Math.random()}`, title: 'X', description: 'desc' });
    for (const transicao of ['submeter', 'aprovar', 'publicar']) {
      await request(app).post(`/admin/training/tracks/${trilha.body.id}/${transicao}`).set('Authorization', `Bearer ${tokenAdmin}`);
    }
    const aula = await request(app)
      .post('/admin/training/lessons')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ trackId: trilha.body.id, code: `aula-quiz-arq-${Math.random()}`, title: 'Aula a arquivar', description: 'desc', content: 'conteudo', estimatedMinutes: 5 });
    const quiz = await request(app).put(`/admin/training/lessons/${aula.body.id}/quiz`).set('Authorization', `Bearer ${tokenAdmin}`).send({ passingScore: 70 });
    const questao = await request(app)
      .post('/admin/training/questions')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ quizId: quiz.body.id, question: 'Pergunta?', opcoes: [{ text: 'Certa', correct: true }, { text: 'Errada', correct: false }] });
    for (const transicao of ['submeter', 'aprovar', 'publicar']) {
      await request(app).post(`/admin/training/lessons/${aula.body.id}/${transicao}`).set('Authorization', `Bearer ${tokenAdmin}`);
    }

    const antesDeArquivar = await request(app).get(`/academia/aulas/${aula.body.id}/quiz`).set('Authorization', `Bearer ${tokenVendedor}`);
    expect(antesDeArquivar.status).toBe(200);

    await request(app).post(`/admin/training/lessons/${aula.body.id}/arquivar`).set('Authorization', `Bearer ${tokenAdmin}`);

    const depoisDeArquivar = await request(app).get(`/academia/aulas/${aula.body.id}/quiz`).set('Authorization', `Bearer ${tokenVendedor}`);
    expect(depoisDeArquivar.status).toBe(404);

    const opcaoCorreta = questao.body.opcoes.find((o: { correct: boolean }) => o.correct).id;
    const responderDepoisDeArquivar = await request(app)
      .post(`/academia/aulas/${aula.body.id}/quiz/responder`)
      .set('Authorization', `Bearer ${tokenVendedor}`)
      .send({ respostas: [{ questionId: questao.body.id, optionId: opcaoCorreta }] });
    expect(responderDepoisDeArquivar.status).toBe(404);
  });

  it('fluxo completo: draft → submeter → aprovar → publicar → visível pro vendedor', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-fluxo-${Math.random()}`, title: 'Trilha completa', description: 'desc' });
    const id = trilha.body.id;

    for (const transicao of ['submeter', 'aprovar', 'publicar']) {
      const res = await request(app).post(`/admin/training/tracks/${id}/${transicao}`).set('Authorization', `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
    }

    const final = await prisma.academyTrack.findUniqueOrThrow({ where: { id } });
    expect(final.status).toBe('PUBLISHED');
    expect(final.publishedAt).not.toBeNull();

    const listaVendedor = await request(app).get('/academia/trilhas').set('Authorization', `Bearer ${tokenVendedor}`);
    expect(listaVendedor.body.trilhas.some((t: { id: string }) => t.id === id)).toBe(true);
  });

  it('não pode pular etapa (DRAFT direto pra PUBLISHED)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-pular-${Math.random()}`, title: 'X', description: 'desc' });

    const res = await request(app).post(`/admin/training/tracks/${trilha.body.id}/publicar`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(409);
    expect(res.body.type).toBe('transicao_invalida');
  });

  it('arquivar remove do catálogo do vendedor — trilha publicada some após arquivar', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-arquivar-${Math.random()}`, title: 'Trilha a arquivar', description: 'desc' });
    const id = trilha.body.id;
    for (const transicao of ['submeter', 'aprovar', 'publicar']) {
      await request(app).post(`/admin/training/tracks/${id}/${transicao}`).set('Authorization', `Bearer ${tokenAdmin}`);
    }

    await request(app).post(`/admin/training/tracks/${id}/arquivar`).set('Authorization', `Bearer ${tokenAdmin}`);

    const listaVendedor = await request(app).get('/academia/trilhas').set('Authorization', `Bearer ${tokenVendedor}`);
    expect(listaVendedor.body.trilhas.some((t: { id: string }) => t.id === id)).toBe(false);
  });
});

describe('Sanitização de mídia (seção 7/51/52)', () => {
  it('rejeita URL de vídeo fora da allowlist (nunca embed/iframe arbitrário)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-video-${Math.random()}`, title: 'X', description: 'desc' });

    const res = await request(app)
      .post('/admin/training/lessons')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        trackId: trilha.body.id,
        code: `aula-video-${Math.random()}`,
        title: 'Aula com vídeo malicioso',
        description: 'desc',
        content: 'conteudo',
        estimatedMinutes: 5,
        videoUrl: 'https://malicious-site.example.com/embed',
      });

    expect(res.status).toBe(400);
    expect(res.body.type).toBe('video_url_invalida');
  });

  it('rejeita protocolo perigoso em URL de material (javascript:)', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-material-${Math.random()}`, title: 'X', description: 'desc' });

    // zod já rejeita como URL inválida antes de chegar na validação de negócio
    const res = await request(app)
      .post('/admin/training/lessons')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        trackId: trilha.body.id,
        code: `aula-material-${Math.random()}`,
        title: 'Aula',
        description: 'desc',
        content: 'conteudo',
        estimatedMinutes: 5,
        materialUrl: 'javascript:alert(1)',
      });

    expect(res.status).toBe(400);
  });

  it('aceita URL de vídeo do YouTube', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-yt-${Math.random()}`, title: 'X', description: 'desc' });

    const res = await request(app)
      .post('/admin/training/lessons')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        trackId: trilha.body.id,
        code: `aula-yt-${Math.random()}`,
        title: 'Aula com vídeo válido',
        description: 'desc',
        content: 'conteudo',
        estimatedMinutes: 5,
        tipoConteudo: 'VIDEO',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      });

    expect(res.status).toBe(201);
  });
});

describe('Banco de questões — DTO nunca vaza gabarito pro vendedor (seção 74)', () => {
  it('GET admin retorna correct, mas a rota do vendedor nunca', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    const trilha = await request(app)
      .post('/admin/training/tracks')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ code: `trilha-quiz-${Math.random()}`, title: 'X', description: 'desc' });
    const aula = await request(app)
      .post('/admin/training/lessons')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ trackId: trilha.body.id, code: `aula-quiz-${Math.random()}`, title: 'Aula', description: 'desc', content: 'conteudo', estimatedMinutes: 5 });

    const quiz = await request(app).put(`/admin/training/lessons/${aula.body.id}/quiz`).set('Authorization', `Bearer ${tokenAdmin}`).send({ passingScore: 70 });
    const questao = await request(app)
      .post('/admin/training/questions')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ quizId: quiz.body.id, question: 'Pergunta?', opcoes: [{ text: 'Certa', correct: true }, { text: 'Errada', correct: false }] });
    expect(questao.status).toBe(201);
    expect(questao.body.opcoes.some((o: { correct: boolean }) => o.correct === true)).toBe(true);

    for (const transicao of ['submeter', 'aprovar', 'publicar']) {
      await request(app).post(`/admin/training/lessons/${aula.body.id}/${transicao}`).set('Authorization', `Bearer ${tokenAdmin}`);
    }

    const quizVendedor = await request(app).get(`/academia/aulas/${aula.body.id}/quiz`).set('Authorization', `Bearer ${tokenVendedor}`);
    expect(quizVendedor.status).toBe(200);
    const bruto = JSON.stringify(quizVendedor.body);
    expect(bruto).not.toContain('"correct"');
  });

  it('vendedor não consegue criar/editar questão nem trocar o quiz (mass assignment)', async () => {
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const tokenVendedor = assinarToken({ vendedorId: vendedor.id, empresaId: empresa.id, lojaId: loja.id, papel: 'VENDEDOR' });

    expect((await request(app).post('/admin/training/questions').set('Authorization', `Bearer ${tokenVendedor}`).send({})).status).toBe(403);
    expect((await request(app).put('/admin/training/questions/qualquer-id').set('Authorization', `Bearer ${tokenVendedor}`).send({})).status).toBe(403);
  });
});

describe('13 Mandamentos — rota admin', () => {
  it('GET garante a estrutura de 13 e devolve a completude', async () => {
    const { empresa, loja } = await criarFixtureEmpresa();
    const tokenAdmin = await tokenAdminDe(empresa.id, loja.id);

    const res = await request(app).get('/admin/training/mandamentos').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.mandamentos).toHaveLength(13);
    expect(res.body.completude).toHaveProperty('completo');
  });
});
