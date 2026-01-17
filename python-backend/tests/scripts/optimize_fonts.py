import os
import shutil

FONTS_DIR = "fonts"
REQUIRED_WEIGHTS = ["Regular", "Bold", "Italic", "BoldItalic"]

def prune_fonts():
    if not os.path.exists(FONTS_DIR):
        print(f"Directory {FONTS_DIR} not found.")
        return

    total_deleted = 0
    total_saved = 0

    for family in os.listdir(FONTS_DIR):
        family_path = os.path.join(FONTS_DIR, family)
        if not os.path.isdir(family_path):
            continue

        print(f"Processing family: {family}")
        
        # Look for a 'static' folder inside
        static_folder = os.path.join(family_path, "static")
        target_search_dir = static_folder if os.path.exists(static_folder) else family_path
        
        # 1. Identify files to keep
        files_in_dir = os.listdir(target_search_dir)
        to_keep = {}

        for weight in REQUIRED_WEIGHTS:
            # Find the best candidate for this weight
            candidates = [f for f in files_in_dir if f.endswith(f"-{weight}.ttf")]
            if candidates:
                # Prefer candidates without size prefixes, or pick the first one (usually smallest size provided by Google)
                # Google often uses 'FontName-Weight.ttf' or 'FontName_Size-Weight.ttf'
                candidates.sort(key=lambda x: len(x)) 
                to_keep[weight] = candidates[0]

        # 2. Delete everything else in the family folder EXCEPT the ones we want to keep
        # Also delete variable fonts in the root family folder
        for item in os.listdir(family_path):
            item_path = os.path.join(family_path, item)
            
            if item == "static":
                # Clean the static folder
                for static_item in os.listdir(target_search_dir):
                    if static_item not in to_keep.values():
                        os.remove(os.path.join(target_search_dir, static_item))
                        total_deleted += 1
                    else:
                        total_saved += 1
            elif item in to_keep.values():
                total_saved += 1
                continue
            else:
                # Delete files like README, LICENSE, Variable fonts
                if os.path.isfile(item_path):
                    os.remove(item_path)
                    total_deleted += 1
                elif os.path.isdir(item_path):
                    # Delete other subdirs like 'variable' if they exist
                    shutil.rmtree(item_path)
                    total_deleted += 1

        # Move kept files from 'static' to the main family folder for easier access
        if os.path.exists(static_folder):
            for weight, filename in to_keep.items():
                old_path = os.path.join(static_folder, filename)
                new_filename = f"{family}-{weight}.ttf"
                new_path = os.path.join(family_path, new_filename)
                shutil.move(old_path, new_path)
                print(f"  Saved: {new_filename}")
            
            # Remove the now empty static folder
            shutil.rmtree(static_folder)

    print(f"\nOptimization Complete!")
    print(f"Total files removed: {total_deleted}")
    print(f"Core font weights preserved: {total_saved}")

if __name__ == "__main__":
    prune_fonts()
