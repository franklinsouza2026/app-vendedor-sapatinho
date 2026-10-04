// Central do ADMIN da Fase 1 — operação sem terminal, sem SQL, sem seed.
// Toda rota: requireAuth('ADMIN') (papel e status revalidados no banco) e
// empresa SEMPRE do token. IDs no path/corpo são conferidos contra a empresa
// nos services (outra empresa = 404). Erros de negócio/validação viram 4xx
// pelo errorHandler global.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middlewares/auth';
import { asyncHandler } from '../../middlewares/async-handler';
import { registrarEventoAuditoria } from '../../identidade/auditoria.service';
import { montarEstadoAdmin, auditoriaLegivel } from '../admin/estado.service';
import { definirMetaDaLoja, definirMetaDoVendedor } from '../admin/metas-admin.service';
import { definirElegibilidade, lancarAjuste, reconhecer } from '../admin/gestao.service';
import { salvarConfigFase1 } from '../config.service';
import { atualizarProduto, criarProduto } from '../incentivos/produtos.service';
import { criarPremio } from '../incentivos/premios.service';
import { arquivarMissao, cancelarMissao, duplicarMissao, encerrarMissao, missaoEntradaSchema, obterMissao, publicarMissao, salvarRascunho, validarMissao } from '../missoes/missoes.service';
import { criarCompeticaoFase1, transicionarCompeticaoFase1 } from '../competicoes/competicoes.service';
import { arquivarCampanha, campanhaEntradaSchema, cancelarCampanha, duplicarCampanha, encerrarCampanha, obterCampanha, publicarCampanha, salvarCampanha, validarCampanha } from '../campanhas/campanhas.service';
import { alterarStatus, atualizarConfiguracao, criarIntegracao, definirCredencial, desvincularLoja, listarIntegracoes, testarConexao, vincularLoja, buscarIntegracao } from '../integracoes/integracoes.service';
import { saudeDaEmpresa } from '../integracoes/saude.service';
import { contarFilaSync, solicitarSyncIntegracao } from '../../queues/sync-erp.queue';
import { naoEncontrado } from '../../utils/erro-http';

export const fase1AdminRouter = Router();
const admin = requireAuth('ADMIN');
const empresa = (req: { auth?: { empresaId: string } }) => req.auth!.empresaId;
const ator = (req: { auth?: { vendedorId: string } }) => req.auth!.vendedorId;

// ------------------------------------------------------------------ leitura

fase1AdminRouter.get('/admin/fase1/estado', admin, asyncHandler(async (req, res) => res.json(await montarEstadoAdmin(empresa(req)))));
fase1AdminRouter.get('/admin/fase1/auditoria', admin, asyncHandler(async (req, res) => res.json({ eventos: await auditoriaLegivel(empresa(req), Math.min(Number(req.query.limite) || 200, 500)) })));
fase1AdminRouter.get('/admin/fase1/saude', admin, asyncHandler(async (req, res) => res.json(await saudeDaEmpresa(empresa(req), contarFilaSync))));

// ------------------------------------------------------------------ metas, elegibilidade, config

fase1AdminRouter.put(
  '/admin/fase1/metas/:mes/vendedores/:vendedorId',
  admin,
  asyncHandler(async (req, res) => res.json(await definirMetaDoVendedor(empresa(req), ator(req), req.params.vendedorId, req.params.mes, req.body)))
);
fase1AdminRouter.put(
  '/admin/fase1/metas/:mes/lojas/:lojaId',
  admin,
  asyncHandler(async (req, res) => {
    const { valor } = z.object({ valor: z.number().min(0).nullable() }).parse(req.body);
    res.json(await definirMetaDaLoja(empresa(req), ator(req), req.params.lojaId, req.params.mes, valor));
  })
);
fase1AdminRouter.put('/admin/fase1/vendedores/:vendedorId/elegibilidade', admin, asyncHandler(async (req, res) => res.json(await definirElegibilidade(empresa(req), ator(req), req.params.vendedorId, req.body))));
fase1AdminRouter.put('/admin/fase1/config', admin, asyncHandler(async (req, res) => res.json(await salvarConfigFase1(empresa(req), ator(req), req.body))));
fase1AdminRouter.post('/admin/fase1/ajustes', admin, asyncHandler(async (req, res) => res.status(201).json(await lancarAjuste(empresa(req), ator(req), req.body))));
fase1AdminRouter.post('/admin/fase1/reconhecimentos', admin, asyncHandler(async (req, res) => res.status(201).json(await reconhecer(empresa(req), ator(req), req.body))));

// ------------------------------------------------------------------ catálogo

fase1AdminRouter.post('/admin/fase1/produtos', admin, asyncHandler(async (req, res) => res.status(201).json(await criarProduto(empresa(req), ator(req), req.body))));
fase1AdminRouter.patch('/admin/fase1/produtos/:id', admin, asyncHandler(async (req, res) => res.json(await atualizarProduto(empresa(req), ator(req), req.params.id, req.body))));
fase1AdminRouter.post('/admin/fase1/premios', admin, asyncHandler(async (req, res) => res.status(201).json(await criarPremio(empresa(req), ator(req), req.body))));

// ------------------------------------------------------------------ missões governadas

fase1AdminRouter.post('/admin/fase1/missoes/validar', admin, asyncHandler(async (req, res) => res.json({ itens: await validarMissao(empresa(req), missaoEntradaSchema.parse(req.body)) })));
fase1AdminRouter.post('/admin/fase1/missoes', admin, asyncHandler(async (req, res) => res.status(201).json(await salvarRascunho(empresa(req), ator(req), req.body))));
fase1AdminRouter.get('/admin/fase1/missoes/:id', admin, asyncHandler(async (req, res) => res.json(await obterMissao(empresa(req), req.params.id))));
fase1AdminRouter.put('/admin/fase1/missoes/:id', admin, asyncHandler(async (req, res) => res.json(await salvarRascunho(empresa(req), ator(req), req.body, req.params.id))));
const acaoCiclo = z.object({ motivo: z.string().optional() });
fase1AdminRouter.post(
  '/admin/fase1/missoes/:id/:acao',
  admin,
  asyncHandler(async (req, res) => {
    const { motivo } = acaoCiclo.parse(req.body ?? {});
    const e = empresa(req);
    const a = ator(req);
    const id = req.params.id;
    switch (req.params.acao) {
      case 'publicar':
        return res.json(await publicarMissao(e, a, id));
      case 'encerrar':
        return res.json(await encerrarMissao(e, a, id));
      case 'cancelar':
        return res.json(await cancelarMissao(e, a, id, motivo ?? ''));
      case 'arquivar':
        return res.json(await arquivarMissao(e, a, id));
      case 'duplicar':
        return res.status(201).json(await duplicarMissao(e, a, id));
      default:
        throw naoEncontrado('ação');
    }
  })
);

// ------------------------------------------------------------------ competições

fase1AdminRouter.post('/admin/fase1/competicoes', admin, asyncHandler(async (req, res) => res.status(201).json(await criarCompeticaoFase1(empresa(req), ator(req), req.body))));
fase1AdminRouter.post(
  '/admin/fase1/competicoes/:id/:acao',
  admin,
  asyncHandler(async (req, res) => {
    const acao = z.enum(['encerrar', 'cancelar', 'arquivar']).safeParse(req.params.acao);
    if (!acao.success) throw naoEncontrado('ação');
    const { motivo } = acaoCiclo.parse(req.body ?? {});
    res.json(await transicionarCompeticaoFase1(empresa(req), ator(req), req.params.id, acao.data, motivo));
  })
);

// ------------------------------------------------------------------ campanhas

fase1AdminRouter.post('/admin/fase1/campanhas/validar', admin, asyncHandler(async (req, res) => res.json({ itens: await validarCampanha(empresa(req), campanhaEntradaSchema.parse(req.body)) })));
fase1AdminRouter.post('/admin/fase1/campanhas', admin, asyncHandler(async (req, res) => res.status(201).json(await salvarCampanha(empresa(req), ator(req), req.body))));
fase1AdminRouter.get('/admin/fase1/campanhas/:id', admin, asyncHandler(async (req, res) => res.json(await obterCampanha(empresa(req), req.params.id))));
fase1AdminRouter.put('/admin/fase1/campanhas/:id', admin, asyncHandler(async (req, res) => res.json(await salvarCampanha(empresa(req), ator(req), req.body, req.params.id))));
fase1AdminRouter.post(
  '/admin/fase1/campanhas/:id/:acao',
  admin,
  asyncHandler(async (req, res) => {
    const { motivo } = acaoCiclo.parse(req.body ?? {});
    const e = empresa(req);
    const a = ator(req);
    const id = req.params.id;
    switch (req.params.acao) {
      case 'publicar':
        return res.json(await publicarCampanha(e, a, id));
      case 'encerrar':
        return res.json(await encerrarCampanha(e, a, id));
      case 'cancelar':
        return res.json(await cancelarCampanha(e, a, id, motivo ?? ''));
      case 'arquivar':
        return res.json(await arquivarCampanha(e, a, id));
      case 'duplicar':
        return res.status(201).json(await duplicarCampanha(e, a, id));
      default:
        throw naoEncontrado('ação');
    }
  })
);

// ------------------------------------------------------------------ Configurações → Integrações

fase1AdminRouter.get('/admin/fase1/integracoes', admin, asyncHandler(async (req, res) => res.json({ integracoes: await listarIntegracoes(empresa(req)) })));
fase1AdminRouter.post(
  '/admin/fase1/integracoes',
  admin,
  asyncHandler(async (req, res) => {
    const { provedor, configuracao } = z.object({ provedor: z.enum(['LINX', 'MOCK', 'CONTROLADO']), configuracao: z.unknown().optional() }).parse(req.body);
    res.status(201).json(await criarIntegracao(empresa(req), ator(req), provedor, configuracao));
  })
);
fase1AdminRouter.patch('/admin/fase1/integracoes/:id', admin, asyncHandler(async (req, res) => res.json(await atualizarConfiguracao(empresa(req), ator(req), req.params.id, req.body?.configuracao))));
fase1AdminRouter.put(
  '/admin/fase1/integracoes/:id/credencial',
  admin,
  asyncHandler(async (req, res) => {
    const { credencial } = z.object({ credencial: z.string() }).parse(req.body);
    res.json(await definirCredencial(empresa(req), ator(req), req.params.id, credencial));
  })
);
fase1AdminRouter.post(
  '/admin/fase1/integracoes/:id/status',
  admin,
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(['ATIVA', 'DESATIVADA']) }).parse(req.body);
    res.json(await alterarStatus(empresa(req), ator(req), req.params.id, status));
  })
);
fase1AdminRouter.put(
  '/admin/fase1/integracoes/:id/lojas/:lojaId',
  admin,
  asyncHandler(async (req, res) => {
    const { codigoExterno } = z.object({ codigoExterno: z.string() }).parse(req.body);
    res.json(await vincularLoja(empresa(req), ator(req), req.params.id, req.params.lojaId, codigoExterno));
  })
);
fase1AdminRouter.delete('/admin/fase1/integracoes/:id/lojas/:lojaId', admin, asyncHandler(async (req, res) => res.json(await desvincularLoja(empresa(req), ator(req), req.params.id, req.params.lojaId))));
fase1AdminRouter.post('/admin/fase1/integracoes/:id/testar', admin, asyncHandler(async (req, res) => res.json(await testarConexao(empresa(req), req.params.id))));
fase1AdminRouter.post(
  '/admin/fase1/integracoes/:id/sincronizar',
  admin,
  asyncHandler(async (req, res) => {
    const integracao = await buscarIntegracao(empresa(req), req.params.id);
    await solicitarSyncIntegracao(integracao.id);
    await registrarEventoAuditoria({ empresaId: empresa(req), acao: 'INTEGRATION_SYNC_REQUESTED', actorId: ator(req), metadata: { integracaoId: integracao.id } });
    res.status(202).json({ solicitado: true });
  })
);
