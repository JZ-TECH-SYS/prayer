# tools/simulador-termica/remover.ps1
# Remove a impressora e a porta criadas pelo instalar.ps1 (o driver Generic / Text Only fica).
#Requires -RunAsAdministrator

$nome = "PRAYER SIMULADOR TERMICA"
$porta = "PRAYER_SIM_9100"
Get-PrintJob -PrinterName $nome -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue
if (Get-Printer -Name $nome -ErrorAction SilentlyContinue) { Remove-Printer -Name $nome; Write-Host "Impressora removida." }
if (Get-PrinterPort -Name $porta -ErrorAction SilentlyContinue) { Remove-PrinterPort -Name $porta; Write-Host "Porta removida." }
