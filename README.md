# File Store – Node.js

A lightweight local file storage server.  
Base URL: `http://localhost:1919`

---

## Setup

```powershell
cd C:\Users\lapto\StudioProjects\file-store
npm install
node server.js
```

---

## PowerShell Commands

### Upload a single file
```powershell
Invoke-RestMethod -Uri "http://localhost:1919/upload" `
  -Method Post `
  -Form @{ files = Get-Item "C:\path\to\yourfile.txt" }
```

### Upload multiple files
```powershell
$f1 = Get-Item "C:\path\to\file1.pdf"
$f2 = Get-Item "C:\path\to\file2.png"
Invoke-RestMethod -Uri "http://localhost:1919/upload" `
  -Method Post `
  -Form @{ files = $f1, $f2 }
```

### List all files
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/files" | ConvertTo-Json -Depth 3
```

### Download a file
```powershell
# Replace <stored_name> with the filename returned by /files
Invoke-WebRequest -Uri "http://localhost:3000/files/<stored_name>" `
  -OutFile "C:\Downloads\<stored_name>"
```

### Delete a file
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/files/<stored_name>" -Method Delete
```

---

## API Reference

| Method | Endpoint          | Description              |
|--------|-------------------|--------------------------|
| POST   | /upload           | Upload one or more files |
| GET    | /files            | List all files           |
| GET    | /files/:name      | Download a file          |
| DELETE | /files/:name      | Delete a file            |
| GET    | /                 | Health check             |

---

## Tips

- Uploaded files are saved to the `uploads/` folder with a timestamp prefix.
- To run in background: `Start-Process node -ArgumentList "server.js" -WindowStyle Hidden`
- To auto-start on login, add a shortcut to the Startup folder pointing to the above command.
