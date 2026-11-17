# tools/simulador-termica/instalar.ps1
# Cria a impressora "PRAYER SIMULADOR TERMICA" (driver Generic / Text Only, porta TCP 127.0.0.1:9100 RAW).
# Rodar UMA vez num PowerShell como Administrador. Para remover: .\remover.ps1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$porta = "PRAYER_SIM_9100"
$driver = "Generic / Text Only"
$nome = "PRAYER SIMULADOR TERMICA"

if (-not (Get-PrinterDriver -Name $driver -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando driver '$driver' (vem com o Windows)..."
    Add-PrinterDriver -Name $driver
}
if (-not (Get-PrinterPort -Name $porta -ErrorAction SilentlyContinue)) {
    Write-Host "Criando porta $porta -> 127.0.0.1:9100 (RAW)..."
    Add-PrinterPort -Name $porta -PrinterHostAddress "127.0.0.1" -PortNumber 9100
}
if (-not (Get-Printer -Name $nome -ErrorAction SilentlyContinue)) {
    Write-Host "Criando impressora '$nome'..."
    Add-Printer -Name $nome -DriverName $driver -PortName $porta
}
Get-Printer -Name $nome | Select-Object Name, DriverName, PortName, Shared | Format-Table -AutoSize
Write-Host "Pronto. Agora rode: node tools\simulador-termica\termica.js"
