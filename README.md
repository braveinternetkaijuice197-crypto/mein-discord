# Nachtwache – Hosting für Discord-Bots und Websites

Ein kleiner Hosting-Server. Nutzer geben ihren Bot-Token ein (der Bot geht online) oder einen GitHub-Link (die Website geht online).

## Starten (auf deinem PC)
1. Node.js ab Version 18 installieren.
2. Im Ordner `npm install` ausführen.
3. Die Datei `.env.example` nach `.env` kopieren und bei `SECRET_KEY` einen langen, zufälligen Text eintragen. Mit diesem Schlüssel werden die Tokens verschlüsselt. Geht er verloren, starten gespeicherte Bots nicht mehr.
4. `npm start` ausführen und http://localhost:3000 öffnen.

Bots laufen, solange das Programm läuft. Auf deinem PC ist die Seite nur bei dir erreichbar. Für ein öffentliches, dauerhaft laufendes Hosting muss derselbe Ordner auf einen Server, der immer an ist.

## Seite auf GitHub Pages, Server woanders
Die Datei `public/index.html` kann zusätzlich auf GitHub Pages liegen. Sie schickt Token und Links dann an deinen Server:
1. Öffne `public/index.html` und trage bei `SERVER_URL` die HTTPS-Adresse deines Servers ein.
2. Trage in der `.env` bei `ALLOWED_ORIGIN` die Adresse deiner GitHub-Seite ein, z. B. `https://dein-name.github.io`.
3. Die Seite zeigt oben an, ob der Server erreichbar ist. Ohne HTTPS sendet sie keine Tokens.

## GitHub
Lade den Code in ein Repository, damit er gesichert ist. GitHub kann ihn aber nicht ausführen: GitHub Pages liefert nur fertige Webseiten aus. Lade nie die Dateien `.env` oder den Ordner `data` hoch (die `.gitignore` verhindert das).

## Wichtig vor dem öffentlichen Betrieb
- Dieser Code wurde noch nicht mit einem echten Bot-Token getestet. Probiere ihn zuerst mit einem Test-Bot aus.
- Es gibt keine Benutzerkonten. Wer ID und Schlüssel hat, kann einen Eintrag entfernen. Es gibt keine Begrenzung pro Person, nur eine Gesamtgrenze (20 Bots, 50 Websites, in `server.js` änderbar).
- Hoste nur über HTTPS (zum Beispiel mit einem Reverse-Proxy), sonst läuft der Token unverschlüsselt durchs Netz.
- Wer fremde Inhalte und Tokens hostet, braucht in Deutschland Impressum und Datenschutzerklärung und haftet für Missbrauch.
