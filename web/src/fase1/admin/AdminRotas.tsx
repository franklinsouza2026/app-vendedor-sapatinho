/**
 * Rotas do Admin da Fase 1 — chunk lazy separado: quem só usa o app da
 * vendedora (celular) não baixa a central de comando. Dados reais
 * (ProvedorAdmin → GET /admin/fase1/estado).
 */
import { Route, Routes } from 'react-router-dom';
import { AbaRecompensaDiaria } from '../../screens/admin/AdminGamificacao';
import { AdminLayout } from './AdminLayout';
import { ProvedorAdmin } from './AdminDados';
import { Analytics, Auditoria, Prontidao, SaudeDados, VisaoGeral } from './Operacao';
import { LojaDetalhe, Lojas, NovoVendedor, VendedorDetalhe, Vendedores } from './Pessoas';
import { Indicadores, Metas, Rankings } from './Performance';
import { Campanhas, Competicoes, EditorCampanha, EditorMissao, Missoes, Premiacoes } from './Incentivos';
import { ConquistasAdmin, FeedAdmin, ReconhecimentosAdmin, VendaCoinsAdmin, XpAdmin } from './GamificacaoComunicacao';
import { Integracoes } from './Integracoes';
import { TituloPagina } from './ui';

function AcessoDiario() {
  return (
    <>
      <TituloPagina titulo="Recompensa de acesso diário" descricao="XP e VendaCoins pelo primeiro acesso do dia ao app. Uma por vendedor por dia, garantida no servidor." />
      <AbaRecompensaDiaria />
    </>
  );
}

export default function AdminRotas() {
  return (
    <ProvedorAdmin>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<VisaoGeral />} />
          <Route path="vendedores" element={<Vendedores />} />
          <Route path="vendedores/novo" element={<NovoVendedor />} />
          <Route path="vendedores/:id" element={<VendedorDetalhe />} />
          <Route path="lojas" element={<Lojas />} />
          <Route path="lojas/:id" element={<LojaDetalhe />} />
          <Route path="metas" element={<Metas />} />
          <Route path="rankings" element={<Rankings />} />
          <Route path="indicadores" element={<Indicadores />} />
          <Route path="campanhas" element={<Campanhas />} />
          <Route path="campanhas/nova" element={<EditorCampanha />} />
          <Route path="campanhas/:id" element={<EditorCampanha />} />
          <Route path="missoes" element={<Missoes />} />
          <Route path="missoes/nova" element={<EditorMissao />} />
          <Route path="missoes/:id" element={<EditorMissao />} />
          <Route path="competicoes" element={<Competicoes />} />
          <Route path="premiacoes" element={<Premiacoes />} />
          <Route path="xp" element={<XpAdmin />} />
          <Route path="vendacoins" element={<VendaCoinsAdmin />} />
          <Route path="conquistas" element={<ConquistasAdmin />} />
          <Route path="reconhecimentos" element={<ReconhecimentosAdmin />} />
          <Route path="feed" element={<FeedAdmin />} />
          <Route path="saude" element={<SaudeDados />} />
          <Route path="auditoria" element={<Auditoria />} />
          <Route path="prontidao" element={<Prontidao />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="integracoes" element={<Integracoes />} />
          <Route path="acesso-diario" element={<AcessoDiario />} />
        </Route>
      </Routes>
    </ProvedorAdmin>
  );
}
