-- Etapa 2C.3B — autoridade de plataforma para conhecimento GLOBAL.
--
-- ADITIVA E NÃO DESTRUTIVA: acrescenta um valor ao enum de papel. Nenhuma
-- linha é alterada, nenhum usuário é reclassificado e, em particular,
-- NENHUM ADMIN É PROMOVIDO. Quem é ADMIN continua ADMIN.
--
-- `ADD VALUE IF NOT EXISTS` é idempotente: reaplicar a migration não falha.
--
-- Por que um papel novo em vez de ampliar o ADMIN: conhecimento GLOBAL
-- pertence à plataforma e conteúdo de empresa pertence à empresa. Hoje a
-- instalação tem uma empresa só, e é justamente por isso que a distinção
-- precisa existir agora — quando houver dezenas, um ADMIN de uma delas
-- reescrevendo conhecimento global seria um problema sério, e a hora de
-- fechar é antes.
--
-- Este papel nasce sem nenhuma permissão herdada: os guards do projeto são
-- allowlists positivas (`requireAuth('ADMIN')`, `papel === 'VENDEDOR'`), então
-- um valor novo não abre porta nenhuma por omissão.

ALTER TYPE "Papel" ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';
