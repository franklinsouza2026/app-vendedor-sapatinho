import '@testing-library/jest-dom/vitest';

// jsdom não implementa scrollIntoView — usado pelo Coach pra rolar até a
// última mensagem — sem isso, qualquer teste que renderiza mensagens quebra.
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

// jsdom também não implementa window.scrollTo — a Fase 1 rola ao topo a cada troca de tela.
if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
}
