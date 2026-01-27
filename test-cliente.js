const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startServer() {
    const server = http.createServer((req, res) => {
        let filePath = '.' + req.url;
        if (filePath === './') filePath = './cliente.html';
        
        const urlPath = filePath.split('?')[0];
        const extname = String(path.extname(urlPath)).toLowerCase();
        
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpg'
        };
        
        const contentType = mimeTypes[extname] || 'application/octet-stream';
        
        fs.readFile(urlPath, (error, content) => {
            if (error) {
                res.writeHead(error.code === 'ENOENT' ? 404 : 500);
                res.end(error.code === 'ENOENT' ? '404' : '500');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    });
    return server;
}

async function testClientePage() {
    console.log('Iniciando pruebas de cliente.html...\n');
    
    const server = startServer();
    const PORT = 8080;
    
    await new Promise(resolve => {
        server.listen(PORT, () => {
            console.log('Servidor HTTP en localhost:' + PORT + '\n');
            resolve();
        });
    });
    
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    const consoleErrors = [];
    const pageErrors = [];
    
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    
    page.on('pageerror', error => {
        pageErrors.push(error.toString());
    });
    
    try {
        console.log('Cargando cliente.html?brand=code\n');
        await page.goto('http://localhost:8080/cliente.html?brand=code', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const functionsTest = await page.evaluate(() => {
            const functionsToCheck = [
                'handleLogin',
                'handleRegister',
                'showRegisterScreen',
                'showLoginScreen',
                'openMyTickets',
                'openProfile',
                'showEvents',
                'backToEvents',
                'redeemCode',
                'switchTicketTab',
                'openBuyModal',
                'closeModal',
                'doLogout',
                'openEventDetail'
            ];
            
            const results = {};
            functionsToCheck.forEach(fn => {
                results[fn] = typeof window[fn] === 'function';
            });
            
            return results;
        });
        
        console.log('==============================================');
        console.log('VERIFICACION DE FUNCIONES GLOBALES');
        console.log('==============================================\n');
        
        const available = [];
        const missing = [];
        
        Object.entries(functionsTest).forEach(([fn, exists]) => {
            if (exists) {
                available.push(fn);
            } else {
                missing.push(fn);
            }
        });
        
        if (available.length > 0) {
            console.log('Funciones DISPONIBLES (' + available.length + '):');
            available.forEach(fn => console.log('  ✓ ' + fn));
            console.log('');
        }
        
        if (missing.length > 0) {
            console.log('Funciones NO ENCONTRADAS (' + missing.length + '):');
            missing.forEach(fn => console.log('  ✗ ' + fn));
            console.log('');
        }
        
        if (consoleErrors.length > 0) {
            console.log('==============================================');
            console.log('ERRORES DE CONSOLA (' + consoleErrors.length + ')');
            console.log('==============================================\n');
            consoleErrors.forEach((e, i) => console.log((i+1) + '. ' + e));
            console.log('');
        }
        
        if (pageErrors.length > 0) {
            console.log('==============================================');
            console.log('ERRORES DE PAGINA (' + pageErrors.length + ')');
            console.log('==============================================\n');
            pageErrors.forEach((e, i) => console.log((i+1) + '. ' + e));
            console.log('');
        }
        
        console.log('==============================================');
        console.log('RESUMEN');
        console.log('==============================================');
        console.log('Total funciones verificadas: ' + Object.keys(functionsTest).length);
        console.log('Funciones disponibles: ' + available.length);
        console.log('Funciones no encontradas: ' + missing.length);
        console.log('Errores de consola: ' + consoleErrors.length);
        console.log('Errores de pagina: ' + pageErrors.length);
        console.log('');
        
        const allOk = missing.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0;
        console.log(allOk ? 'ESTADO: ✓ TODAS LAS PRUEBAS OK' : 'ESTADO: ✗ SE ENCONTRARON PROBLEMAS');
        console.log('==============================================\n');
        
    } catch (error) {
        console.error('Error durante la prueba:', error.message);
    } finally {
        await browser.close();
        server.close();
        console.log('Servidor cerrado\n');
    }
}

testClientePage().catch(console.error);
