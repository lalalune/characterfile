import fs from 'fs';
import Ajv from 'ajv';

// Read the JSON schema file
const schemaJson = fs.readFileSync('schema/character.schema.json', 'utf-8');
const schema = JSON.parse(schemaJson);

// Read the JSON file to validate
const jsonString = fs.readFileSync('examples/example.character.json', 'utf-8');
const jsonData = JSON.parse(jsonString);

// Create an Ajv instance
const ajv = new Ajv();

// Compile the schema
const validate = ajv.compile(schema);

// Validate the JSON data against the schema
const valid = validate(jsonData);

if (valid) {
  console.log('JSON file is valid against the schema.');
} else {
  console.log('JSON file is not valid against the schema.');
  console.log('Validation errors:', validate.errors);
}