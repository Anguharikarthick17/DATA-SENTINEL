FROM python:3.11-slim

# Non-root user
RUN groupadd -r loader && useradd -r -g loader -u 1001 loader

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY consumer.py neo4j_writer.py ./

RUN chown -R loader:loader /app

USER loader

CMD ["python", "consumer.py"]
