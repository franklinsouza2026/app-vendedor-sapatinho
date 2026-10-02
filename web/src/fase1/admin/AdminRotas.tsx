/**
 * Rotas do Admin da Fase 1 — chunk lazy separado: quem só usa o app da
 * vendedora (celular) não baixa a central de comando.
 */
import { Route, Routes } from 'react-router-dom';
import { AdminLayout } from './AdminLayout';
import { Analytics, Auditoria, Prontidao, SaudeDados, VisaoGeral } from './Operacao';
import { LojaDetalhe, Lojas, NovoVendedor, VendedorDetalhe, Vendedores } from './Pessoas';
import { Indicadores, Metas, Rankings } from './Performance';
import { Campanhas, Competicoes, EditorCampanha, EditorMissao, Missoes, Premiacoes } from './Incentivos';
import { ConquistasAdmin, FeedAdmin, ReconhecimentosAdmin, VendaCoinsAdmin, XpAdmin } from './GamificacaoComunicacao';

export default function AdminRotas() {
  return (
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
      </Route>
    </Routes>
  );
}
