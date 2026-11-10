// Textos padrão (terminologia de apoio voluntário / indenizatório).
import { fmtBRL, valorPorExtenso, fmtCPF, nomeMes, valorUnitario } from './calc.js';

const empresaTxt = (cfg) => (cfg.empresa ? ` (${cfg.empresa})` : '');

export function termoFamilia(cfg) {
  return `
  <p>Este sistema é um <strong>livro-caixa particular</strong> da Família Colaboradora, destinado
  exclusivamente ao registro e à conferência da <strong>ajuda de custo voluntária, de caráter
  indenizatório</strong>, para custeio de alimentação e transporte de profissionais de enfermagem
  que atendem o paciente.</p>
  <p>Os valores registrados decorrem de <strong>mera liberalidade da família</strong>, não possuem
  natureza remuneratória, não constituem contraprestação por serviços e não guardam relação com a
  empresa prestadora de serviços${empresaTxt(cfg)}. O registro de plantões aqui feito serve apenas para
  apuração do apoio e <strong>não é controle de jornada</strong>.</p>
  <p>A família pode alterar ou encerrar o apoio a qualquer momento, sem que isso gere qualquer direito
  adquirido.</p>`;
}

export function termoProfissional(cfg, prof) {
  const v = cfg.valores;
  return `
  <p>Eu, <strong>${prof?.nome || '____________________'}</strong>, CPF
  <strong>${prof?.cpf ? fmtCPF(prof.cpf) : '___.___.___-__'}</strong>, declaro estar ciente de que:</p>
  <ol>
    <li>A ajuda de custo concedida pela Família Colaboradora${cfg.familia ? ' ' + cfg.familia : ''} decorre de
    <strong>mera liberalidade</strong> da família, tem caráter <strong>voluntário e indenizatório</strong> e se
    destina exclusivamente ao suporte de custos de <strong>deslocamento (transporte) e alimentação</strong>.</li>
    <li>O valor <strong>não possui natureza salarial</strong>, não integra qualquer remuneração e
    <strong>não gera vínculo empregatício</strong> com a família, com o paciente ou com a empresa prestadora de
    serviços${empresaTxt(cfg)}.</li>
    <li>O apoio é ativado ao completar o <strong>4º plantão fixo</strong> no mês, com repasse retroativo dos
    plantões 1 a 3 do mesmo mês. Plantões de cobertura não entram nessa contagem.</li>
    <li>Referência por plantão de 12h: ${fmtBRL(valorUnitario('integral', v))} (alimentação ${fmtBRL(v.alimentacao)} +
    transporte ${fmtBRL(v.transporte)}) ou, caso opte por se alimentar no local, apenas transporte
    (${fmtBRL(valorUnitario('transporte', v))}).</li>
    <li>O repasse do mês é feito até o <strong>5º dia útil do mês subsequente</strong>, podendo a família alterar ou
    encerrar o apoio a qualquer momento, sem que isso gere direito adquirido.</li>
  </ol>`;
}

export function textoOpcaoTransporte(prof) {
  return `${prof?.nome || 'O(a) profissional'} optou por se alimentar no local (refeições fornecidas pela família) e,
  por isso, receber a ajuda de custo apenas na modalidade <strong>Transporte</strong>.`;
}

export function textoRecibo(cfg, prof, ext) {
  return `
  <p>Eu, <strong>${prof.nome}</strong>, inscrito(a) no CPF sob o nº <strong>${fmtCPF(prof.cpf)}</strong>,
  declaro que recebi da <strong>Família Colaboradora${cfg.familia ? ' ' + cfg.familia : ''}</strong> a importância de
  <strong>${fmtBRL(ext.total)}</strong> (${valorPorExtenso(ext.total)}), a título de
  <strong>ajuda de custo voluntária de caráter indenizatório</strong>, destinada ao custeio de despesas de
  alimentação e/ou transporte relativas aos ${ext.plantoesFixos} plantões registrados no mês de referência
  <strong>${nomeMes(ext.mes)}</strong>, conforme Extrato de Repasse.</p>
  <p>Declaro estar ciente de que o valor decorre de mera liberalidade da família, <strong>não possui natureza
  salarial</strong> ou remuneratória, não constitui contraprestação por serviços e <strong>não gera vínculo
  empregatício</strong> com a família, com o paciente ou com a empresa prestadora de serviços${empresaTxt(cfg)},
  dando plena e geral quitação quanto ao valor e ao período acima.</p>`;
}

export const DECLARACAO_EXTRATO = `Declaro para os devidos fins que o valor acima refere-se a ajuda de custo
voluntária para custeio de alimentação e transporte, sem natureza salarial.`;
