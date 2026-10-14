# App NeuroWin

Projeto completo React + TypeScript da App NeuroWin.

## Arranque

```bash
npm.cmd install
npm.cmd run dev
```

## Sinais ao vivo

Os módulos em `src/features/live-signals/` ligam-se localmente ao separador do jogo através da API de captura de ecrã do navegador (`getDisplayMedia`). O utilizador escolhe explicitamente o separador a partilhar. Os resultados reconhecidos alimentam os motores estatísticos e o desempenho das previsões é calculado automaticamente.

A app não extrai nem reutiliza cookies, tokens ou credenciais do casino.

Ver `COMECA_AQUI.txt` e `VERSAO_COMPLETA_V8.txt`.
