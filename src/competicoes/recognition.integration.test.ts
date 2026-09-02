// Recognition (Fatia 8, seção 30-32/78/96/107) — puramente social, texto
// sanitizado (nunca HTML bruto), nunca autorreconhecimento.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { registrarReconhecimento, listarReconhecimentosRecebidos } from './recognition.service';
import { CompeticoesError } from './constantes';

describe('Recognition — regras (seção 30-32)', () => {
  it('rejeita autorreconhecimento', async () => {
    const { vendedor, loja } = await criarFixtureEmpresa();
    await expect(registrarReconhecimento({ authorId: vendedor.id, subjectId: vendedor.id, tipo: 'PERFORMANCE', lojaId: loja.id })).rejects.toThrow(CompeticoesError);
  });

  it('registra reconhecimento válido e aparece na lista de recebidos', async () => {
    const { loja } = await criarFixtureEmpresa();
    const empresaId = (await prisma.loja.findUniqueOrThrow({ where: { id: loja.id } })).empresaId;
    const autor = await prisma.vendedor.create({ data: { empresaId, lojaId: loja.id, matriculaErp: `AUT-${randomUUID()}`, nome: 'Autor', senhaHash: 'x' } });
    const subject = await prisma.vendedor.create({ data: { empresaId, lojaId: loja.id, matriculaErp: `SUB-${randomUUID()}`, nome: 'Subject', senhaHash: 'x' } });

    const reconhecimento = await registrarReconhecimento({ authorId: autor.id, subjectId: subject.id, tipo: 'TEAMWORK', message: 'Ótimo trabalho em equipe!', lojaId: loja.id });
    expect(reconhecimento.tipo).toBe('TEAMWORK');

    const recebidos = await listarReconhecimentosRecebidos(subject.id);
    expect(recebidos).toHaveLength(1);
  });

  it('sanitiza tags HTML da mensagem (seção 78/107) — nunca armazena <script> ou similares', async () => {
    const { loja } = await criarFixtureEmpresa();
    const empresaId = (await prisma.loja.findUniqueOrThrow({ where: { id: loja.id } })).empresaId;
    const autor = await prisma.vendedor.create({ data: { empresaId, lojaId: loja.id, matriculaErp: `AUT2-${randomUUID()}`, nome: 'Autor2', senhaHash: 'x' } });
    const subject = await prisma.vendedor.create({ data: { empresaId, lojaId: loja.id, matriculaErp: `SUB2-${randomUUID()}`, nome: 'Subject2', senhaHash: 'x' } });

    const reconhecimento = await registrarReconhecimento({ authorId: autor.id, subjectId: subject.id, tipo: 'CUSTOM', message: '<script>alert(1)</script>Parabéns!', lojaId: loja.id });
    expect(reconhecimento.message).not.toMatch(/<script/i);
    expect(reconhecimento.message).toContain('Parabéns!');
  });

  it('limita o tamanho da mensagem (nunca campo livre gigante)', async () => {
    const { loja } = await criarFixtureEmpresa();
    const empresaId = (await prisma.loja.findUniqueOrThrow({ where: { id: loja.id } })).empresaId;
    const autor = await prisma.vendedor.create({ data: { empresaId, lojaId: loja.id, matriculaErp: `AUT3-${randomUUID()}`, nome: 'Autor3', senhaHash: 'x' } });
    const subject = await prisma.vendedor.create({ data: { empresaId, lojaId: loja.id, matriculaErp: `SUB3-${randomUUID()}`, nome: 'Subject3', senhaHash: 'x' } });

    const textoGigante = 'a'.repeat(10000);
    const reconhecimento = await registrarReconhecimento({ authorId: autor.id, subjectId: subject.id, tipo: 'CUSTOM', message: textoGigante, lojaId: loja.id });
    expect(reconhecimento.message!.length).toBeLessThanOrEqual(500);
  });
});
