import os
import datetime
import requests
import xarray as xr

# -----------------------------
# CONFIG
# -----------------------------
# HRRR run time (latest cycle)
now = datetime.datetime.utcnow()
run_hour = now.hour - (now.hour % 6)  # HRRR runs every hour, but 6hr blocks are safer
date_str = now.strftime("%Y%m%d")
hour_str = f"{run_hour:02d}"

forecast_hour = "f00"  # analysis (current conditions)

# NOMADS URL
base_url = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/hrrr/prod"
file_name = f"hrrr.t{hour_str}z.wrfsfc{forecast_hour}.grib2"
url = f"{base_url}/hrrr.{date_str}/conus/{file_name}"

# Local file
output_file = file_name

# -----------------------------
# DOWNLOAD HRRR FILE
# -----------------------------
print(f"Downloading HRRR from: {url}")

response = requests.get(url, stream=True)

if response.status_code == 200:
    with open(output_file, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    print("Download complete.")
else:
    raise Exception(f"Download failed: {response.status_code}")

# -----------------------------
# OPEN WITH XARRAY
# -----------------------------
print("Opening GRIB2 file...")

ds = xr.open_dataset(
    output_file,
    engine="cfgrib",
    backend_kwargs={"filter_by_keys": {"typeOfLevel": "surface"}}
)

# -----------------------------
# EXTRACT VARIABLES
# -----------------------------
print("Extracting variables...")

# Temperature (K → C)
temp_k = ds["t2m"]
temp_c = temp_k - 273.15

# Relative Humidity (%)
rh = ds["r2"]

# Wind components (m/s)
u10 = ds["u10"]
v10 = ds["v10"]

# Wind speed
wind_speed = (u10**2 + v10**2) ** 0.5

# -----------------------------
# PRINT SAMPLE OUTPUT
# -----------------------------
print("\nSample Data:")
print(f"Temperature (C): {float(temp_c.values[0][0]):.2f}")
print(f"Relative Humidity (%): {float(rh.values[0][0]):.2f}")
print(f"Wind Speed (m/s): {float(wind_speed.values[0][0]):.2f}")

# -----------------------------
# OPTIONAL: SAVE TO NETCDF
# -----------------------------
output_nc = "hrrr_processed.nc"

xr.Dataset({
    "temperature_c": temp_c,
    "relative_humidity": rh,
    "wind_speed": wind_speed
}).to_netcdf(output_nc)

print(f"\nSaved processed data to {output_nc}")
