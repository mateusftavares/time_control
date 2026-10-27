/* Os dois módulos disputam o document.title. O pomodoro tem prioridade enquanto estiver rodando
   ou pausado (é o que muda a cada segundo); fora isso, vale a hora prevista para deslogar. */
let textoPomodoro = '';
let textoPonto = '';

function pintar() {
  document.title = textoPomodoro || textoPonto || 'TimeVer';
}

/**
 * @description Texto do pomodoro no título da aba; '' quando parado
 * @param {string} texto
 */
export function tituloPomodoro(texto) {
  textoPomodoro = texto;
  pintar();
}

/**
 * @description Texto do ponto no título da aba; '' quando não há previsão
 * @param {string} texto
 */
export function tituloPonto(texto) {
  textoPonto = texto;
  pintar();
}
