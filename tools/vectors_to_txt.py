import json
import os
import sys

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    vec_path = os.path.join(root, "crates", "aethel-auth", "tests", "vectors.json")
    if not os.path.exists(vec_path):
        print(f"Error: {vec_path} not found", file=sys.stderr)
        sys.exit(1)
    with open(vec_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for entry in data.get("vectors", []):
        print(f"{entry['input']} {entry['uuid']}")

if __name__ == "__main__":
    main()