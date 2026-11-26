# JR Kits storefront

Open the extracted **JR-Kits/index.html** in a browser to use your downloaded shop offline. Keep the assets folder beside index.html. The WhatsApp checkout opens WhatsApp when you have internet access.

## Edit the shop

- **catalog.json** contains the jerseys, photo paths, sizes, prices in TZS, printing prices, contact number, slides and wardrobe selections.
- **assets/** contains the pictures used by the website.
- **index.html**, **store.css** and **wardrobe.css** control the pages and design.
- **store.js** and **wardrobe.js** control shopping, printing options, galleries and saved wardrobes. Bags and wardrobes are stored in the visitor's browser on each website address.

For a local preview after editing, run `python -m http.server 8000` inside the extracted JR-Kits folder and open http://localhost:8000. This preview reads your edited files directly. On Windows you can use `py` instead of `python`.

Run `python scripts/build-store.py` to refresh double-click offline mode and create a new **dist/** folder. Upload the contents of dist to a static web host. The current editable backup will be at **downloads/JR-Kits-Storefront.zip** inside that folder. In the development repository, the storefront files are in **storefront/**.
