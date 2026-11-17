# Simulador de impressora térmica

Testa o caminho completo **cliente → PrayerApp → spooler do Windows → impressora** sem papel.
Uma impressora "Generic / Text Only" do Windows aponta para `127.0.0.1:9100`; o `termica.js`
escuta nessa porta, recebe os bytes ESC/POS e desenha o cupom no terminal (com corte e código de barras).

## Usar

1. Uma vez, num PowerShell **como Administrador**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\simulador-termica\instalar.ps1
   ```
   Cria a impressora `PRAYER SIMULADOR TERMICA` (porta `PRAYER_SIM_9100`, RAW, sem compartilhamento).
2. Ligar a térmica simulada:
   ```bash
   node tools/simulador-termica/termica.js
   ```
3. Abrir o PrayerApp e imprimir na `PRAYER SIMULADOR TERMICA` (pelo sistema cliente ou pelo
   "Teste de impressão" da bandeja). Cada job aparece no terminal e fica em `saida/<n>.bin` / `.txt`.

Remover: `tools\simulador-termica\remover.ps1` (como Administrador).

## O que ele avisa

- `corte: NÃO` → o job chegou sem `GS V` (a térmica não cortaria o papel).
- `caractere(s) UTF-8 (c2a0...)` → acento ou espaço especial (ex.: o `R$ 10,00` do `toLocaleString`)
  em UTF-8; numa térmica em CP850 sai como lixo (`R$Â 10,00`).

## Referência medida (notebook corporativo, Windows 11)

| | 1.0.5 | 1.0.6 |
|---|---|---|
| 3 vales | "Impresso com sucesso (fallback)" e **nada chega** na impressora (o `print /d` grava um arquivo com o nome da fila) | os 3 chegam, na ordem |
| 5 vales | — | ~9 s no total (o spooler da máquina leva ~4 s por job, igual ao `Out-Printer`) |
