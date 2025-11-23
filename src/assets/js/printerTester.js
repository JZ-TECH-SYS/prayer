(function () {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function generateCacheKey() {
        return Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    }

    function clearAllCaches() {
        if (window.printerCache) {
            window.printerCache.clear();
        }

        const timestamp = generateCacheKey();
        console.log(`🧹 Cache limpo - Timestamp: ${timestamp}`);
        return timestamp;
    }

    function setLoading(element, isLoading) {
        if (!element) return;

        if (isLoading) {
            element.classList.add("loading");
            element.disabled = true;
        } else {
            element.classList.remove("loading");
            element.disabled = false;
        }
    }

    function formatResult(result) {
        if (typeof result === "string") {
            try {
                result = JSON.parse(result);
            } catch (e) {
                return `🔍 RAW OUTPUT:\n${result}`;
            }
        }

        const timestamp = new Date().toLocaleTimeString("pt-BR");
        const printer = $("#printer").value;
        const activeTab = document.querySelector(".nav-link.active").textContent.trim();

        let output = `╔═══════════════════════════════════════════════════════════════╗\n`;
        output += `║ 🚀 PRAYER PRINTER SYSTEM - RESULTADO DA IMPRESSÃO           ║\n`;
        output += `╠═══════════════════════════════════════════════════════════════╣\n`;
        output += `║ 🕐 Horário: ${timestamp.padEnd(47)} ║\n`;

        if (result.status === "success") {
            output += "║ ✅ STATUS: SUCESSO                                           ║\n";
            output += `║ 🎉 ${(result.message || "Impressão realizada com sucesso!").padEnd(52)} ║\n`;
        } else if (result.status === "error") {
            output += "║ ❌ STATUS: ERRO                                              ║\n";
            output += `║ 💥 ${(result.message || "Falha na impressão").substring(0, 52).padEnd(52)} ║\n`;
        } else {
            output += "║ ⚠️  STATUS: DESCONHECIDO                                     ║\n";
        }

        output += "╠═══════════════════════════════════════════════════════════════╣\n";

        const printerIcon = getPrinterIcon(printer);
        output += `║ ${printerIcon} Impressora: ${printer.substring(0, 45).padEnd(45)} ║\n`;

        if (result.acao) {
            const actionIcon = result.acao.includes("HTML")
                ? "🌐"
                : result.acao.includes("texto")
                    ? "📝"
                    : "⚙️";
            output += `║ ${actionIcon} Ação: ${result.acao.padEnd(50)} ║\n`;
        }

        output += `║ 📋 Modo: ${activeTab.padEnd(51)} ║\n`;

        if (result.details || result.data) {
            output += "╠═══════════════════════════════════════════════════════════════╣\n";
            output += "║ 🛠️ DETALHES TÉCNICOS:                                        ║\n";

            if (result.details) {
                const details =
                    typeof result.details === "string" ? result.details : JSON.stringify(result.details);
                const lines = details.substring(0, 200).split("\n");
                lines.forEach((line) => {
                    output += `║ 📌 ${line.substring(0, 52).padEnd(52)} ║\n`;
                });
            }
        }

        output += "╚═══════════════════════════════════════════════════════════════╝\n";

        if (result.status === "success") {
            output += "\n💡 Dica: Use Ctrl+P para imprimir rapidamente ou Ctrl+R para atualizar impressoras!";
        } else if (result.status === "error") {
            output += "\n🔧 Dica: Verifique se a impressora está ligada e conectada. Use Ctrl+R para atualizar a lista.";
        }

        return output;
    }

    function getPrinterIcon(printerName = "") {
        const name = printerName.toLowerCase();

        if (name.includes("pdf")) return "📄";
        if (name.includes("label") || name.includes("etiqueta")) return "🏷️";
        if (name.includes("thermal") || name.includes("tp-") || name.includes("mp-")) return "🧾";
        if (name.includes("laser")) return "⚡";
        if (name.includes("inkjet") || name.includes("jato")) return "💧";
        if (name.includes("matrix") || name.includes("matricial")) return "📊";
        if (name.includes("network") || name.includes("\\\\")) return "🌐";
        if (name.includes("epson")) return "🟦";
        if (name.includes("canon")) return "🔴";
        if (name.includes("hp")) return "🔵";
        if (name.includes("brother")) return "🟤";
        if (name.includes("samsung")) return "⚫";
        if (name.includes("xerox")) return "🟡";

        return "🖨️";
    }

    async function loadPrinters(forceClear = false) {
        const refreshBtn = $("#refresh");
        const sel = $("#printer");

        setLoading(refreshBtn, true);

        try {
            if (forceClear) {
                clearAllCaches();
            }

            const cacheKey = generateCacheKey();
            const res = await window.printerTest.list({ _cache: cacheKey });

            sel.innerHTML = '<option value="">🔄 Carregando impressoras...</option>';

            if (res && res.status === "success" && Array.isArray(res.data)) {
                sel.innerHTML = "";

                if (res.data.length === 0) {
                    sel.innerHTML = '<option value="">❌ Nenhuma impressora encontrada</option>';
                } else {
                    for (const p of res.data) {
                        const opt = document.createElement("option");
                        opt.value = p.Name;

                        let icon = "🖨️";
                        if (p.Name.toLowerCase().includes("pdf")) icon = "📄";
                        else if (p.Name.toLowerCase().includes("label") || p.Name.toLowerCase().includes("etiqueta")) icon = "🏷️";
                        else if (p.DriverName && p.DriverName.toLowerCase().includes("thermal")) icon = "🧾";

                        const displayName =
                            p.ShareName && p.ShareName !== "FALSE"
                                ? `${icon} ${p.Name} (Rede: ${p.ShareName})`
                                : `${icon} ${p.Name}`;

                        opt.textContent = displayName;
                        opt.dataset.meta = JSON.stringify(p);
                        sel.appendChild(opt);
                    }
                }
            } else {
                sel.innerHTML = '<option value="">❌ Erro ao carregar impressoras</option>';
            }

            updateMeta();

            const resultDiv = $("#result");
            const count = res?.data?.length || 0;
            resultDiv.textContent = `🔄 ATUALIZAÇÃO DE IMPRESSORAS CONCLUÍDA\n\n✅ ${count} impressora${count !== 1 ? "s" : ""
                } encontrada${count !== 1 ? "s" : ""}\n🕐 ${new Date().toLocaleTimeString(
                    "pt-BR"
                )}\n\n💡 Selecione uma impressora acima para começar a imprimir!`;

            console.log(`🔄 Impressoras recarregadas (${count} encontradas)`);
        } catch (error) {
            console.error("Erro ao carregar impressoras:", error);
            sel.innerHTML = '<option value="">❌ Erro de conexão</option>';

            const resultDiv = $("#result");
            resultDiv.textContent = `❌ ERRO AO CARREGAR IMPRESSORAS\n\n💥 ${error.message}\n🕐 ${new Date().toLocaleTimeString(
                "pt-BR"
            )}\n\n🔧 Verifique sua conexão e tente novamente.`;
        } finally {
            setLoading(refreshBtn, false);
        }
    }

    function updateMeta() {
        const sel = $("#printer");
        const metaDiv = $("#printerMeta");
        const opt = sel.options[sel.selectedIndex];

        if (!opt || !opt.value) {
            metaDiv.innerHTML = "<em>Selecione uma impressora para ver detalhes</em>";
            return;
        }

        try {
            const meta = JSON.parse(opt?.dataset?.meta || "{}");

            const statusIcon = meta.WorkOffline ? "🔴" : "🟢";
            const sharedIcon = meta.Shared ? "🌐" : "💻";

            metaDiv.innerHTML = `
        <strong>Driver:</strong> ${meta.DriverName || "N/A"} ${sharedIcon}<br>
        <strong>Porta:</strong> ${meta.PortName || "N/A"}<br>
        <strong>Status:</strong> ${statusIcon} ${meta.WorkOffline ? "Offline" : "Online"}
      `;
        } catch (e) {
            metaDiv.innerHTML = "<em>Erro ao carregar informações da impressora</em>";
        }
    }

    async function printText() {
        const printer = $("#printer").value;
        const text = $("#text").value;
        const btn = $("#btnPrintText");
        const resultDiv = $("#result");

        if (!printer) {
            resultDiv.textContent = formatResult({
                status: "error",
                message: "Nenhuma impressora selecionada! 🖨️",
                details: "Selecione uma impressora na lista acima antes de imprimir.",
            });
            return;
        }

        if (!text.trim()) {
            resultDiv.textContent = formatResult({
                status: "error",
                message: "Conteúdo vazio! 📝",
                details: "Digite algum texto na área de conteúdo para imprimir.",
            });
            return;
        }

        setLoading(btn, true);

        try {
            resultDiv.classList.add("updating");
            resultDiv.textContent = "🔄 Processando impressão...\n⏳ Aguarde um momento...";

            const cacheKey = clearAllCaches();
            const processedText = text.replace(
                /\$\{new Date\(\)\.toLocaleString\('pt-BR'\)\}/g,
                new Date().toLocaleString("pt-BR")
            );

            const res = await window.printerTest.printText({
                printer,
                text: processedText,
                _cache: cacheKey,
            });

            resultDiv.classList.remove("updating");
            resultDiv.classList.add("updating");
            resultDiv.textContent = formatResult(res);

            setTimeout(() => resultDiv.classList.remove("updating"), 500);

            console.log("📝 Texto impresso:", { printer, length: processedText.length });
        } catch (error) {
            console.error("Erro na impressão de texto:", error);
            resultDiv.classList.remove("updating");
            resultDiv.textContent = formatResult({
                status: "error",
                message: `Erro na impressão: ${error.message}`,
                details: `Tipo: ${error.name || "Erro desconhecido"}\nHorário: ${new Date().toLocaleString("pt-BR")}`,
            });
        } finally {
            setLoading(btn, false);
        }
    }

    async function printHtml() {
        const printer = $("#printer").value;
        const html = $("#html").value;
        const btn = $("#btnPrintHtml");
        const resultDiv = $("#result");

        if (!printer) {
            resultDiv.textContent = formatResult({
                status: "error",
                message: "Nenhuma impressora selecionada! 🖨️",
                details: "Selecione uma impressora na lista acima antes de imprimir.",
            });
            return;
        }

        if (!html.trim()) {
            resultDiv.textContent = formatResult({
                status: "error",
                message: "Código HTML vazio! 🌐",
                details: "Digite algum código HTML na área de edição para imprimir.",
            });
            return;
        }

        setLoading(btn, true);

        try {
            resultDiv.classList.add("updating");
            resultDiv.textContent = "🌐 Renderizando HTML...\n⚙️ Preparando impressão...\n⏳ Aguarde...";

            const cacheKey = clearAllCaches();
            const processedHtml = html.replace(
                /\$\{new Date\(\)\.toLocaleString\('pt-BR'\)\}/g,
                new Date().toLocaleString("pt-BR")
            );

            const res = await window.printerTest.printHtml({
                printer,
                html: processedHtml,
                _cache: cacheKey,
            });

            resultDiv.classList.remove("updating");
            resultDiv.classList.add("updating");
            resultDiv.textContent = formatResult(res);

            setTimeout(() => resultDiv.classList.remove("updating"), 500);

            console.log("🌐 HTML impresso:", { printer, length: processedHtml.length });
        } catch (error) {
            console.error("Erro na impressão HTML:", error);
            resultDiv.classList.remove("updating");
            resultDiv.textContent = formatResult({
                status: "error",
                message: `Erro na impressão: ${error.message}`,
                details: `Tipo: ${error.name || "Erro desconhecido"}\nHorário: ${new Date().toLocaleString("pt-BR")}`,
            });
        } finally {
            setLoading(btn, false);
        }
    }

    function registerEvents() {
        $("#printer").addEventListener("change", updateMeta);
        $("#refresh").addEventListener("click", () => loadPrinters(true));
        $("#btnPrintText").addEventListener("click", printText);
        $("#btnPrintHtml").addEventListener("click", printHtml);

        document.addEventListener("keydown", (e) => {
            if (!e.ctrlKey) return;

            switch (e.key) {
                case "p":
                    e.preventDefault();
                    if (document.querySelector(".tab-pane.active").id === "tab-text") {
                        printText();
                    } else {
                        printHtml();
                    }
                    break;
                case "r":
                    e.preventDefault();
                    loadPrinters(true);
                    break;
                default:
                    break;
            }
        });
    }

    function bootstrap() {
        const resultDiv = $("#result");
        resultDiv.textContent = `🚀 PRAYER PRINTER TESTER INICIADO\n\n🔄 Carregando impressoras disponíveis...\n⏳ Aguarde um momento...\n\n💡 Esta ferramenta permite testar impressões RAW e HTML\n🎯 Interface redesenhada com tema VS Code`;

        registerEvents();
        loadPrinters();

        console.log(`
🚀 Prayer Printer Tester carregado!
🎨 Tema escuro VS Code ativado!
⌨️  Atalhos disponíveis:
   Ctrl+P = Imprimir conteúdo da aba ativa
   Ctrl+R = Recarregar impressoras (limpa cache)
🧹 Cache automático desabilitado para sempre pegar versão atualizada
    `);
    }

    document.addEventListener("DOMContentLoaded", bootstrap);
})();
