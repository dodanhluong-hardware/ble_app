# MVAPP BLE Web App

Web app test BLE cho firmware ESP32 dùng UUID:

- Service: `0000ab00-0000-1000-8000-00805f9b34fb`
- Write: `0000ab01-0000-1000-8000-00805f9b34fb`
- Notify: `0000ab02-0000-1000-8000-00805f9b34fb`

## Chạy nhanh trên PC

Mở terminal tại thư mục này:

```powershell
cd "C:\Users\DELL\Downloads\MV\MV\MV BASE\MVsB1_BT_Audio_SDK_v0.3.2\MVsB1_BT_Audio_SDK_v0.3.2\MVsB1_Base_SDK\examples\ESP32_MVAPP_BLE\ble_app"
python -m http.server 8080
```

Sau đó mở Chrome:

- `http://localhost:8080`

## Dùng trên điện thoại

Web Bluetooth trên Android cần:

1. Chrome Android.
2. HTTPS (hoặc localhost).
3. Bật Bluetooth và cấp quyền Nearby devices / Location cho Chrome.

Gợi ý deploy:

- Đưa thư mục này lên GitHub Pages để có HTTPS.

## Luồng test

1. Bấm `Check BLE`.
2. Bấm `Connect`.
3. Bấm `Gửi frame` hoặc `Command nhanh`.
4. Theo dõi `Log` để xem `RX frame`.
