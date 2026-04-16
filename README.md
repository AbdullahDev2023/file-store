# File Store – Node.js

A lightweight local file storage server.  
Base URL: `http://localhost:1919`
Hosted URL: `https://store.visioncoachinginstitute.online`

---

## Setup

```powershell
cd C:\Users\lapto\StudioProjects\file-store
npm install
node server.js
```

---

## PowerShell Commands

You can also open the built-in guide at:
```text
https://store.visioncoachinginstitute.online/guide
```

### Upload a single file
```powershell
Invoke-RestMethod -Uri "https://store.visioncoachinginstitute.online/upload" `
  -Method Post `
  -Form @{ files = Get-Item "C:\path\to\yourfile.txt" }
```

The response now includes a `url` for every uploaded file, so you can open or share it immediately.

### Upload multiple files
```powershell
$f1 = Get-Item "C:\path\to\file1.pdf"
$f2 = Get-Item "C:\path\to\file2.png"
Invoke-RestMethod -Uri "https://store.visioncoachinginstitute.online/upload" `
  -Method Post `
  -Form @{ files = $f1, $f2 }
```

### Resumable uploads
For uploads that may fail, pause, or need to continue later:

1. Create a session with `POST /uploads/init`
2. Send each chunk to `POST /uploads/:uploadId/chunk?chunkIndex=N`
3. Check progress with `GET /uploads/:uploadId`
4. Finish with `POST /uploads/:uploadId/complete`

### List all files
```powershell
Invoke-RestMethod -Uri "https://store.visioncoachinginstitute.online/files" | ConvertTo-Json -Depth 3
```

### Download a file
```powershell
# Replace <stored_name> with the filename returned by /files
Invoke-WebRequest -Uri "https://store.visioncoachinginstitute.online/files/<stored_name>" `
  -OutFile "C:\Downloads\<stored_name>"
```

### Delete a file
```powershell
Invoke-RestMethod -Uri "https://store.visioncoachinginstitute.online/files/<stored_name>" -Method Delete
```

---

## API Reference

| Method | Endpoint          | Description              |
|--------|-------------------|--------------------------|
| POST   | /upload           | Upload one or more files |
| GET    | /files            | List all files           |
| GET    | /files/:name      | Download a file          |
| POST   | /uploads/init     | Create resumable session |
| POST   | /uploads/:id/chunk | Store one chunk          |
| GET    | /uploads/:id      | Check resumable progress |
| POST   | /uploads/:id/complete | Finalize resumable upload |
| DELETE | /files/:name      | Delete a file            |
| GET    | /                 | Health check             |

---

## Tips

- Uploaded files are saved to the `uploads/` folder with a timestamp prefix.
- To run in background: `Start-Process node -ArgumentList "server.js" -WindowStyle Hidden`
- To auto-start on login, add a shortcut to the Startup folder pointing to the above command.
