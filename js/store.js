// Armazenamento local criptografado (AES-GCM, chave derivada da senha via PBKDF2).
// Os dados ficam apenas no navegador deste aparelho.

const CHAVE_COFRE = 'acv.cofre.v1';
const CHAVE_SESSAO = 'acv.sessao.v1';
const ITERACOES = 210000;
const SESSAO_HORAS = 12;

let chaveAtual = null;
let fila = Promise.resolve();

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function deB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function criptografiaDisponivel() {
  return !!(globalThis.crypto && crypto.subtle);
}

async function derivarChave(senha, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

function lerCofre() {
  const raw = localStorage.getItem(CHAVE_COFRE);
  return raw ? JSON.parse(raw) : null;
}

export function existeCofre() {
  return !!localStorage.getItem(CHAVE_COFRE);
}

async function gravar(dados, chave, salt, iter) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, enc.encode(JSON.stringify(dados)));
  localStorage.setItem(CHAVE_COFRE, JSON.stringify({ v: 1, salt: b64(salt), iter, iv: b64(iv), ct: b64(ct) }));
}

async function decifrar(cofre, chave) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(cofre.iv) }, chave, deB64(cofre.ct));
  return JSON.parse(dec.decode(pt));
}

async function guardarSessao(chave) {
  const raw = await crypto.subtle.exportKey('raw', chave);
  sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ k: b64(raw), exp: Date.now() + SESSAO_HORAS * 3600e3 }));
}

export async function criarCofre(senha, dados) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const chave = await derivarChave(senha, salt, ITERACOES);
  await gravar(dados, chave, salt, ITERACOES);
  chaveAtual = chave;
  await guardarSessao(chave);
}

/** Abre o cofre com a senha. Lança erro se a senha estiver incorreta. */
export async function abrirCofre(senha) {
  const cofre = lerCofre();
  if (!cofre) throw new Error('Nenhum dado encontrado.');
  const chave = await derivarChave(senha, deB64(cofre.salt), cofre.iter);
  let dados;
  try {
    dados = await decifrar(cofre, chave);
  } catch {
    throw new Error('Senha incorreta.');
  }
  chaveAtual = chave;
  await guardarSessao(chave);
  return dados;
}

/** Retoma a sessão da aba atual (sem pedir senha novamente). */
export async function retomarSessao() {
  try {
    const s = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null');
    const cofre = lerCofre();
    if (!s || !cofre || s.exp < Date.now()) return null;
    const chave = await crypto.subtle.importKey('raw', deB64(s.k), 'AES-GCM', true, ['encrypt', 'decrypt']);
    const dados = await decifrar(cofre, chave);
    chaveAtual = chave;
    return dados;
  } catch {
    sessionStorage.removeItem(CHAVE_SESSAO);
    return null;
  }
}

export function salvar(dados) {
  fila = fila.then(async () => {
    if (!chaveAtual) throw new Error('Sessão encerrada.');
    const cofre = lerCofre();
    await gravar(dados, chaveAtual, deB64(cofre.salt), cofre.iter);
  });
  return fila;
}

export async function trocarSenha(senhaAtual, novaSenha, dados) {
  await abrirCofre(senhaAtual); // valida a senha atual
  await fila;
  await criarCofre(novaSenha, dados);
}

export function encerrarSessao() {
  chaveAtual = null;
  sessionStorage.removeItem(CHAVE_SESSAO);
}

export function apagarTudo() {
  encerrarSessao();
  localStorage.removeItem(CHAVE_COFRE);
}
