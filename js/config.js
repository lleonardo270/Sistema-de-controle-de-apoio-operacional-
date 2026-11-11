// ======================================================================
// Configuração desta instalação (uso exclusivo de uma única família).
//
// Estes valores só preenchem o formulário do PRIMEIRO ACESSO. Depois disso,
// tudo é ajustado dentro do próprio app (aba Ajustes), sem novo deploy.
// ======================================================================
export const CONFIG_PADRAO = {
  familia: '',          // ex.: 'Família Silva'
  paciente: '',         // ex.: 'Sr. José da Silva'
  cidade: '',           // ex.: 'São Paulo/SP' (usada nos recibos e termos)
  valores: {
    alimentacao: 20,    // R$ por plantão de 12h
    transporte: 10,     // R$ por plantão de 12h
  },
};
