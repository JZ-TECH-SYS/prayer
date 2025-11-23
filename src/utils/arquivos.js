function gerarNomeUnico(ext = "txt") {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:.TZ]/g, "") + Math.floor(Math.random() * 1000);
    return `temp_${stamp}.${ext}`;
}

module.exports = { gerarNomeUnico };
