# Example of using the JSON schema to validate a character file

import json

# Check and install jsonschema if not already installed
import subprocess
import sys

def check_and_install_jsonschema():
    try:
        import jsonschema
    except ImportError:
        print("jsonschema is not installed. Installing...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "jsonschema"])
            print("jsonschema has been successfully installed.")
        except subprocess.CalledProcessError:
            print("Failed to install jsonschema. Please install it manually.")
            sys.exit(1)

check_and_install_jsonschema()

from jsonschema import validate

# Read the JSON schema file
with open('schema/character.schema.json', 'r') as schema_file:
    schema = json.load(schema_file)

# Read the JSON file to validate
with open('examples/example.character.json', 'r') as json_file:
    json_data = json.load(json_file)

# Validate the JSON data against the schema
try:
    validate(instance=json_data, schema=schema)
    print('JSON file is valid against the schema.')
except json.exceptions.ValidationError as e:
    print('JSON file is not valid against the schema.')
    print('Validation error:', e)