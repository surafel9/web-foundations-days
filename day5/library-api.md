# Library API Design

## Books Resource Endpoints

### 1. List all books
* **Method**: `GET`
* **Path**: `/books`
* **Description**: Retrieve a list of all books in the library.
* **Success Status Code**: 200 OK

### 2. List books by an author
* **Method**: `GET`
* **Path**: `/books?author={author_name}`
* **Description**: Retrieve a list of books written by a specific author using a query parameter.
* **Success Status Code**: 200 OK

### 3. Get one book
* **Method**: `GET`
* **Path**: `/books/{id}`
* **Description**: Retrieve the details of a specific book by its ID.
* **Success Status Code**: 200 OK

### 4. Create a book
* **Method**: `POST`
* **Path**: `/books`
* **Description**: Add a new book to the library.
* **Request Body**:
  ```json
  {
    "title": "The Great Gatsby",
    "author": "F. Scott Fitzgerald",
    "year": 1925
  }
  ```
* **Success Status Code**: 201 Created

### 5. Update a book
* **Method**: `PUT`
* **Path**: `/books/{id}`
* **Description**: Update the details of an existing book by its ID.
* **Request Body**:
  ```json
  {
    "title": "The Great Gatsby (Revised Edition)",
    "author": "F. Scott Fitzgerald",
    "year": 1926
  }
  ```
* **Success Status Code**: 200 OK

### 6. Delete a book
* **Method**: `DELETE`
* **Path**: `/books/{id}`
* **Description**: Remove a book from the library by its ID.
* **Success Status Code**: 204 No Content

## Error Codes

### 400 Bad Request
* **Example**: Occurs when a client attempts to create a new book (`POST /books`) but provides an invalid request body, such as omitting a required field like `title` or sending a string instead of a number for the `year`.

### 404 Not Found
* **Example**: Occurs when a client attempts to retrieve (`GET /books/999`), update (`PUT /books/999`), or delete (`DELETE /books/999`) a book using an ID (`999`) that does not exist in the database.
