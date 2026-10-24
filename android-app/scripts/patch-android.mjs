// Menambahkan izin lokasi latar belakang ke AndroidManifest hasil `cap add android`.
import fs from 'node:fs'

const file = 'android/app/src/main/AndroidManifest.xml'
let xml = fs.readFileSync(file, 'utf8')
const perms = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
]
const missing = perms.filter((p) => !xml.includes(`"${p}"`))
if (missing.length) {
  const lines = missing.map((p) => `    <uses-permission android:name="${p}" />`).join('\n')
  xml = xml.replace('<application', `${lines}\n\n    <application`)
  fs.writeFileSync(file, xml)
}
console.log('Izin ditambahkan:', missing.length ? missing.join(', ') : '(sudah lengkap)')
