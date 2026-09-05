# winterboard-verifier

Mały, audytowalny skrypt do potwierdzania własności aplikacji Discord w WinterBoard.
Nie wymaga instalowania zależności — wystarczy **Node.js 18 lub nowszy**.

## Bezpieczeństwo

- Discord Client Secret jest wpisywany wyłącznie lokalnie i nie jest wyświetlany w terminalu.
- Client Secret trafia bezpośrednio do `discord.com` przez HTTPS.
- **Client Secret nigdy nie jest wysyłany do WinterBoard.**
- WinterBoard otrzymuje tylko jednorazowy kod i tymczasowy Discord access token.
- Po zakończeniu skrypt próbuje unieważnić access token bezpośrednio w Discordzie, a następnie usuwa referencje do sekretu i tokena z pamięci procesu.
- Skrypt niczego nie zapisuje na dysku i nie korzysta z analytics ani zewnętrznych bibliotek.

Przed uruchomieniem możesz przeczytać cały kod w [verify.js](./verify.js).

## Użycie

1. Pobierz plik `verify.js` z tego repozytorium.
2. W panelu WinterBoard dodaj bota i wybierz „Wygeneruj kod”.
3. Uruchom:

```bash
node verify.js
```

4. Wklej jednorazowy kod WinterBoard.
5. Podaj lokalnie Discord Client Secret aplikacji wskazanej przez skrypt.
6. Po komunikacie o sukcesie wróć do panelu WinterBoard.

Kod wygasa po 15 minutach i po udanej weryfikacji nie można użyć go ponownie.

## Własny backend / development

Domyślnie skrypt łączy się z produkcyjnym API WinterBoard. Inny adres można ustawić zmienną środowiskową:

```bash
# Linux / macOS
WINTERBOARD_API_URL=http://localhost:3002/api node verify.js

# Windows PowerShell
$env:WINTERBOARD_API_URL="http://localhost:3002/api"; node verify.js
```

## Audyt przepływu

1. Skrypt pobiera z WinterBoard Application ID przypisane do jednorazowego kodu.
2. Wysyła Application ID i Client Secret bezpośrednio do Discord OAuth2 Client Credentials.
3. Otrzymany tymczasowy access token wysyła razem z kodem do WinterBoard.
4. WinterBoard odpytuje Discord `/oauth2/@me` i porównuje `application.id`.
5. Skrypt wysyła token do endpointu unieważnienia Discorda.

## Licencja

[MIT](./LICENSE)
